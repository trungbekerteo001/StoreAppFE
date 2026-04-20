window.StoreApp = window.StoreApp || {};                // object toàn cục
window.StoreApp.pages = window.StoreApp.pages || {};    // object con để chứa logic riêng của từng page

    // IIFE - toàn bộ hàm và biến của page chỉ dùng trong phạm vi này để tránh xung đột tên
StoreApp.pages.adminGrn = (() => {
    const dom = StoreApp.dom;               // chứa các phương thức thao tác DOM
    const http = StoreApp.http;             // chứa phương thức request để gọi API
    const role = StoreApp.role;             // chứa phương thức guard và decode role/token
    const msg = StoreApp.message;           // chứa phương thức show để hiển thị thông báo
    const pager = StoreApp.pager;           // chứa helper đọc metadata phân trang

    const API = {                       // chứa endpoint API dùng trong page này
        grn: "/api/GRN",
        supplier: "/api/Supplier",
        product: "/api/Product"
    };

    const state = {                     // state để lưu trạng thái hiện tại của page
        mode: "create",          // create | edit | view
        editId: null,

        items: [],               // list GRN trang hiện tại
        suppliers: [],           // cache supplier
        products: [],            // cache product

        // khai báo phân trang mặc định, sẽ được cập nhật sau khi gọi API
        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        totalCount: 0,
        selectedIds: new Set()
    };

    // khi DOM đã sẵn sàng thì gọi hàm initPage để khởi tạo page
    document.addEventListener("DOMContentLoaded", initPage);

    // hàm khởi tạo page: kiểm tra role, gán event, tải dữ liệu phụ rồi load danh sách phiếu nhập

    async function initPage() {
        if (!role.guard(["Admin"])) return;

        bindEvents();
        await loadMeta();   // load supplier và product để dùng cho filter và modal
        await loadGrns();   // load danh sách phiếu nhập trang 1 và render ra table
    }

    // gom toàn bộ event của page vào một chỗ để dễ nhìn và dễ bảo trì
    function bindEvents() {
        dom.byId("btnGrnSearch")?.addEventListener("click", searchGrns);
        dom.byId("btnGrnClear")?.addEventListener("click", clearFilters);
        dom.byId("btnGrnOpenCreate")?.addEventListener("click", openCreateModal);

        dom.byId("btnGrnBulkDelete")?.addEventListener("click", askBulkDeleteGrns);

        dom.byId("grnCheckAll")?.addEventListener("change", (e) => {
            setCurrentGrnPageSelected(e.target.checked);
        });

        dom.byId("grnPrevBtn")?.addEventListener("click", prevPage);
        dom.byId("grnNextBtn")?.addEventListener("click", nextPage);

        dom.byId("btnGrnCloseX")?.addEventListener("click", closeModal);
        dom.byId("btnGrnClose")?.addEventListener("click", closeModal);
        dom.byId("grnModalBackdrop")?.addEventListener("click", closeModal);

        dom.byId("grnAddRowBtn")?.addEventListener("click", addItemRow);
        dom.byId("grnSaveBtn")?.addEventListener("click", saveGrn);

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeModal();
        });
    }

    // tải supplier và product để phục vụ filter, select trong modal và phần chi tiết dòng hàng
    async function loadMeta() {
        // không biết getAll như nào, set tạm pageSize lớn để lấy hết  
        const supRes = await http.request("GET", `${API.supplier}?PageSize=100`);
        state.suppliers = (supRes?.res?.ok && Array.isArray(supRes.data)) ? supRes.data : [];

        const prodRes = await http.request("GET", `${API.product}?PageSize=1000`);
        state.products = (prodRes?.res?.ok && Array.isArray(prodRes.data)) ? prodRes.data : [];

        fillSelect("grnSupplierFilter", state.suppliers, "-- Tất cả Supplier --");
        fillSelect("grnSupplierId", state.suppliers, "-- Chọn Supplier --");
    }

    // đổ dữ liệu vào thẻ select theo danh sách truyền vào
    function fillSelect(id, items, firstText) {
        const el = dom.byId(id);
        if (!el) return;

        const opts = [];
        // nếu có firstText thì thêm option đầu tiên với value rỗng để làm lựa chọn mặc định hoặc "tất cả"
        if (firstText !== undefined && firstText !== null) {
            opts.push(`<option value="">${dom.esc(firstText)}</option>`);
        }

        // đổ option từ items vào select, nếu items là null hoặc không phải mảng thì dùng [] để tránh lỗi
        for (const x of (items || [])) {
            const label = x.name || x.productName || x.id;
            opts.push(`<option value="${dom.escAttr(x.id)}">${dom.esc(label)}</option>`);
        }

        // gán option vào select
        el.innerHTML = opts.join("");
    }

    // map supplierId sang tên supplier từ cache
    function supplierName(id) {
        const item = state.suppliers.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );
        return item?.name || "";
    }

    // map productId sang tên product từ cache
    function productName(id) {
        const item = state.products.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );
        return item?.productName || "";
    }

    // chuẩn hóa mảng item về đúng shape và ép kiểu số để tính toán an toàn hơn
    function safeItems(items) {
        return Array.isArray(items)
            ? items.map(x => ({
                productId: x.productId || "",
                quantity: Number(x.quantity || 0),
                price: Number(x.price || 0)
            }))
            : [];
    }

    // tính tổng số dòng, tổng số lượng và tổng tiền của 1 phiếu nhập
    function calcTotals(items) {
        // reduce là cách duyệt qua từng phần tử để cộng dồn kết quả
        return safeItems(items).reduce((acc, x) => {    // với mỗi dòng hàng, tăng số dòng lên 1, cộng dồn số lượng và thành tiền
            // acc là biến tích lũy, x là dòng hàng hiện tại
            acc.lines += 1;
            acc.qty += Number(x.quantity || 0);
            acc.amount += Number(x.quantity || 0) * Number(x.price || 0);
            return acc;
        }, { lines: 0, qty: 0, amount: 0 });    // giá trị khởi tạo của acc là { lines: 0, qty: 0, amount: 0  
    }

    // đổi mã/trạng thái phiếu nhập sang text để hiển thị
    function statusText(status) {
        const s = String(status || "").toLowerCase();
        if (s === "completed") return "Completed";
        if (s === "canceled") return "Canceled";
        return "Pending";
    }

    // đổi trạng thái phiếu nhập sang class CSS
    function statusClass(status) {
        const s = String(status || "").toLowerCase();
        if (s === "completed") return "completed";
        if (s === "canceled") return "canceled";
        return "pending";
    }

    // rút gọn id dài để hiển thị gọn hơn trên UI
    function shortId(v, len = 10) {
        const s = String(v || "");
        return s.length > len ? `${s.slice(0, len)}...` : s;
    }

    // format tiền tệ theo kiểu Việt Nam
    function fmtMoney(v) {
        const n = Number(v || 0);
        return `${n.toLocaleString("vi-VN")} ₫`;
    }

    // format ngày giờ để hiển thị lên bảng và modal
    function fmtDate(v) {
        if (!v) return "—";
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return String(v);
        return d.toLocaleString("vi-VN");
    }

    // load danh sách phiếu nhập theo filter + phân trang rồi render ra table
    async function loadGrns(clearMessage = true) {
        if (clearMessage) msg.show("grnMsg", "");

        const supplierId = dom.byId("grnSupplierFilter")?.value?.trim() || "";
        const status = dom.byId("grnStatusFilter")?.value?.trim() || "";

        // tạo queryString để gửi filter / phân trang lên API
        const qs = new URLSearchParams();
        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));

        if (supplierId) qs.set("Supplier", supplierId);
        if (status) qs.set("GRNStatus", status);

        const tb = dom.byId("grnTbody");
        if (tb) tb.innerHTML = `<tr><td colspan="10" class="muted">Đang tải...</td></tr>`;

        const result = await http.request("GET", `${API.grn}?${qs.toString()}`);

        if (!result.res) {
            msg.show("grnMsg", result.raw || "Không gọi được API.", "error");
            if (tb) tb.innerHTML = `<tr><td colspan="10" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            return;
        }

        if (!result.res.ok) {
            msg.show("grnMsg", http.getErrorText(result), "error");
            if (tb) tb.innerHTML = `<tr><td colspan="10" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            return;
        }

        state.items = Array.isArray(result.data) ? result.data : [];

        const meta = pager.readMeta(result, state.items.length);
        state.pageNumber = Math.max(1, Number(meta.currentPage || 1));
        state.totalPages = Math.max(1, Number(meta.totalPages || 1));
        state.totalCount = Math.max(0, Number(meta.totalCount || 0));

        renderRows();
        renderPagerInfo();
    }

    // đổ từng phiếu nhập ra table và gán sự kiện cho các nút thao tác sau khi render
    function renderRows() {
        const tb = dom.byId("grnTbody");
        if (!tb) return;

        if (!state.items.length) {
            tb.innerHTML = `<tr><td colspan="10" class="muted">Không có dữ liệu.</td></tr>`;
            syncGrnCheckAllState();
            return;
        }

        tb.innerHTML = state.items.map((x, idx) => {
            const supplier = supplierName(x.supplierId) || x.supplierId || "—";
            const totals = calcTotals(x.items);
            const status = String(x.grnStatus || "").toLowerCase();
            const canEdit = status === "pending";
            const canBulkDelete = status !== "completed";
            const rowNo = ((state.pageNumber - 1) * state.pageSize) + idx + 1;
            const id = String(x.id);

            if (!canBulkDelete) {
                state.selectedIds.delete(id);
            }

            const checked = canBulkDelete && state.selectedIds.has(id) ? "checked" : "";
            const disabled = canBulkDelete ? "" : "disabled title='Không thể xóa phiếu nhập đã hoàn thành'";

            return `
            <tr>
                <td>
                    <input 
                        type="checkbox" 
                        class="grn-row-check" 
                        value="${dom.escAttr(id)}" 
                        ${checked}
                        ${disabled}
                    />
                </td>
                <td>${rowNo}</td>
                <td><div class="code" title="${dom.escAttr(x.id)}">${dom.esc(shortId(x.id))}</div></td>
                <td>${dom.esc(supplier)}</td>
                <td><span class="badge ${statusClass(x.grnStatus)}">${dom.esc(statusText(x.grnStatus))}</span></td>
                <td>${totals.lines}</td>
                <td>${totals.qty}</td>
                <td>${fmtMoney(totals.amount)}</td>
                <td>${dom.esc(fmtDate(x.updatedAt))}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn" type="button" data-action="view" data-id="${dom.escAttr(x.id)}">Xem</button>
                        ${canEdit ? `<button class="btn" type="button" data-action="edit" data-id="${dom.escAttr(x.id)}">Sửa</button>` : ""}
                        ${canEdit ? `<button class="btn" type="button" data-action="complete" data-id="${dom.escAttr(x.id)}">Duyệt</button>` : ""}
                        ${canEdit ? `<button class="btn danger" type="button" data-action="cancel" data-id="${dom.escAttr(x.id)}">Hủy</button>` : ""}
                    </div>
                </td>
            </tr>
        `;
        }).join("");

        tb.querySelectorAll(".grn-row-check").forEach(chk => {
            chk.addEventListener("change", () => {
                const id = String(chk.value);

                if (chk.disabled) return;

                if (chk.checked) {
                    state.selectedIds.add(id);
                } else {
                    state.selectedIds.delete(id);
                }

                syncGrnCheckAllState();
            });
        });

        tb.querySelectorAll('[data-action="view"]').forEach(btn => {
            btn.addEventListener("click", () => openView(btn.dataset.id));
        });

        tb.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener("click", () => openEdit(btn.dataset.id));
        });

        tb.querySelectorAll('[data-action="complete"]').forEach(btn => {
            btn.addEventListener("click", () => askComplete(btn.dataset.id));
        });

        tb.querySelectorAll('[data-action="cancel"]').forEach(btn => {
            btn.addEventListener("click", () => askCancel(btn.dataset.id));
        });

        syncGrnCheckAllState();
    }

    function syncGrnCheckAllState() {
        const checkAll = dom.byId("grnCheckAll");
        if (!checkAll) return;

        const currentIds = (state.items || [])
            .filter(x => String(x.grnStatus || "").toLowerCase() !== "completed")
            .map(x => String(x.id));

        if (currentIds.length === 0) {
            checkAll.checked = false;
            checkAll.indeterminate = false;
            return;
        }

        const checkedCount = currentIds.filter(id => state.selectedIds.has(id)).length;

        checkAll.checked = checkedCount === currentIds.length;
        checkAll.indeterminate = checkedCount > 0 && checkedCount < currentIds.length;
    }

    function setCurrentGrnPageSelected(checked) {
        (state.items || []).forEach(x => {
            const id = String(x.id);
            const canBulkDelete = String(x.grnStatus || "").toLowerCase() !== "completed";

            if (!canBulkDelete) return;

            if (checked) {
                state.selectedIds.add(id);
            } else {
                state.selectedIds.delete(id);
            }
        });

        dom.byId("grnTbody")?.querySelectorAll(".grn-row-check").forEach(chk => {
            if (!chk.disabled) {
                chk.checked = checked;
            }
        });

        syncGrnCheckAllState();
    }

    function askBulkDeleteGrns() {
        const ids = Array.from(state.selectedIds);

        if (ids.length === 0) {
            msg.show("grnMsg", "Vui lòng chọn ít nhất một phiếu nhập để xóa.", "error");
            return;
        }

        if (!confirm(`Xóa ${ids.length} phiếu nhập đã chọn?`)) return;

        bulkDeleteGrns(ids);
    }

    async function bulkDeleteGrns(ids) {
        const btn = dom.byId("btnGrnBulkDelete");

        if (btn) {
            btn.disabled = true;
            btn.textContent = "Đang xóa...";
        }

        msg.show("grnMsg", "Đang xóa hàng loạt...", "warn");

        try {
            const result = await http.request("POST", `${API.grn}/bulk-delete`, { ids });

            if (!result.res) {
                msg.show("grnMsg", result.raw || "Không gọi được API.", "error");
                return;
            }

            if (!result.res.ok) {
                msg.show("grnMsg", http.getErrorText(result), "error");
                return;
            }

            state.selectedIds.clear();

            await loadGrns(false);

            msg.show("grnMsg", "Xóa hàng loạt phiếu nhập thành công.", "success");
            setTimeout(() => msg.show("grnMsg", ""), 1800);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Xóa hàng loạt";
            }
        }
    }

    // hiển thị thông tin phân trang và khóa/mở nút Prev Next
    function renderPagerInfo() {
        const info = dom.byId("grnPagerInfo");
        const prevBtn = dom.byId("grnPrevBtn");
        const nextBtn = dom.byId("grnNextBtn");

        if (info) {
            const from = state.totalCount === 0 ? 0 : ((state.pageNumber - 1) * state.pageSize) + 1;
            const to = Math.min(state.pageNumber * state.pageSize, state.totalCount);
            info.textContent = `Trang ${state.pageNumber} / ${state.totalPages} • ${from}-${to} / ${state.totalCount}`;
        }

        if (prevBtn) prevBtn.disabled = state.pageNumber <= 1;
        if (nextBtn) nextBtn.disabled = state.pageNumber >= state.totalPages;
    }

    // lùi về trang trước
    function prevPage() {
        if (state.pageNumber <= 1) return;
        state.pageNumber--;
        loadGrns(false);
    }

    // sang trang tiếp theo
    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;
        state.pageNumber++;
        loadGrns(false);
    }

    // tìm kiếm lại dữ liệu từ trang 1 theo bộ lọc hiện tại
    function searchGrns() {
        state.pageNumber = 1;
        state.selectedIds.clear();
        loadGrns();
    }

    // xóa bộ lọc rồi tải lại danh sách
    function clearFilters() {
        const sup = dom.byId("grnSupplierFilter");
        const status = dom.byId("grnStatusFilter");

        if (sup) sup.value = "";
        if (status) status.value = "";

        state.pageNumber = 1;
        state.selectedIds.clear();
        loadGrns();
    }

    // đổi tiêu đề và dòng mô tả phụ của modal
    function setModalMeta(title, sub) {
        const titleEl = dom.byId("grnModalTitle");
        const subEl = dom.byId("grnModalSub");

        if (titleEl) titleEl.textContent = title;
        if (subEl) subEl.textContent = sub;
    }

    // gán value cho input/select theo id
    function setValue(id, value) {
        const el = dom.byId(id);
        if (el) el.value = value ?? "";
    }

    // mở modal phiếu nhập
    function openModal() {
        const m = dom.byId("grnModal");
        if (m) m.classList.add("show");
        setTimeout(() => dom.byId("grnSupplierId")?.focus(), 0);
    }

    // đóng modal phiếu nhập
    function closeModal() {
        const m = dom.byId("grnModal");
        if (m) m.classList.remove("show");
    }

    // mở modal ở chế độ tạo mới và reset dữ liệu ban đầu
    function openCreateModal() {
        state.mode = "create";
        state.editId = null;

        setModalMeta("Thêm phiếu nhập", "Chọn supplier và khai báo các mặt hàng nhập kho.");
        setValue("grnSupplierId", "");

        renderItemRows([{ productId: "", quantity: 1, price: 0 }]);
        applyModalState();
        msg.show("grnModalMsg", "");
        openModal();
    }

    // mở modal ở chế độ chỉ xem
    async function openView(id) {
        await openExisting(id, "view");
    }

    // mở modal ở chế độ sửa
    async function openEdit(id) {
        await openExisting(id, "edit");
    }

    // load chi tiết 1 phiếu nhập từ API rồi đổ dữ liệu vào modal theo mode
    async function openExisting(id, mode) {
        msg.show("grnMsg", "");

        const result = await http.request("GET", `${API.grn}/${encodeURIComponent(id)}`);

        if (!result.res) {
            msg.show("grnMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("grnMsg", http.getErrorText(result), "error");
            return;
        }

        const item = result.data || {};
        state.mode = mode;
        state.editId = item.id || id;

        if (mode === "view") {
            setModalMeta("Chi tiết phiếu nhập", "Xem thông tin phiếu nhập và các mặt hàng đã khai báo.");
        } else {
            setModalMeta("Sửa phiếu nhập", "Chỉ phiếu ở trạng thái chờ duyệt mới được chỉnh sửa.");
        }

        setValue("grnSupplierId", item.supplierId || "");

        const items = safeItems(item.items);
        renderItemRows(items.length ? items : [{ productId: "", quantity: 1, price: 0 }]);

        applyModalState(item.grnStatus);
        msg.show("grnModalMsg", "");
        openModal();
    }

    // khóa/mở các control trong modal tùy theo mode và trạng thái phiếu nhập
    function applyModalState(status) {
        const isReadOnly =
            state.mode === "view" ||
            (String(status || "").toLowerCase() !== "" &&
                String(status || "").toLowerCase() !== "pending" &&
                state.mode !== "create");

        const supplierEl = dom.byId("grnSupplierId");
        const saveBtn = dom.byId("grnSaveBtn");
        const addBtn = dom.byId("grnAddRowBtn");

        if (supplierEl) supplierEl.disabled = state.mode !== "create";
        if (saveBtn) saveBtn.style.display = isReadOnly ? "none" : "inline-flex";
        if (addBtn) addBtn.style.display = isReadOnly ? "none" : "inline-flex";

        document.querySelectorAll("#grnItemsTbody select, #grnItemsTbody input").forEach(el => {
            el.disabled = isReadOnly;
        });

        document.querySelectorAll(".grn-remove-row").forEach(el => {
            el.style.display = isReadOnly ? "none" : "inline-flex";
        });
    }

    // tạo danh sách option sản phẩm cho từng dòng chi tiết
    function productOptions(selectedId) {
        const opts = ['<option value="">-- Chọn sản phẩm --</option>'];

        for (const x of state.products) {
            const selected = String(x.id).toLowerCase() === String(selectedId || "").toLowerCase()
                ? " selected"
                : "";

            opts.push(`<option value="${dom.escAttr(x.id)}"${selected}>${dom.esc(x.productName || x.id)}</option>`);
        }

        return opts.join("");
    }

    // thêm 1 dòng hàng mới vào bảng chi tiết phiếu nhập
    function addItemRow() {
        const rows = Array.from(document.querySelectorAll("#grnItemsTbody tr"));

        // đọc dữ liệu hiện tại trên DOM để giữ nguyên khi thêm dòng mới, nếu không đọc thì sẽ mất hết dữ liệu đã nhập ở các dòng trước đó
        const current = rows.map(row => ({
            productId: row.querySelector(".grn-item-product")?.value?.trim() || "",
            quantity: Number(row.querySelector(".grn-item-qty")?.value || 1),
            price: Number(row.querySelector(".grn-item-price")?.value || 0)
        }));

        current.push({ productId: "", quantity: 1, price: 0 });

        renderItemRows(current);
        applyModalState();
    }

    // xóa 1 dòng hàng khỏi bảng chi tiết
    function removeItemRow(index) {
        const current = readItemsFromDom(false);
        current.splice(index, 1);

        renderItemRows(current.length ? current : [{ productId: "", quantity: 1, price: 0 }]);
        applyModalState();
    }

    // render toàn bộ dòng chi tiết của phiếu nhập

    function renderItemRows(items) {
        const tb = dom.byId("grnItemsTbody");
        if (!tb) return;

        const safe = safeItems(items);

        if (!safe.length) {
            tb.innerHTML = `<tr><td colspan="6" class="empty-row">Chưa có dữ liệu.</td></tr>`;
            updateSummary([]);
            return;
        }

        tb.innerHTML = safe.map((x, idx) => {
            const amount = Number(x.quantity || 0) * Number(x.price || 0);

            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td>
                        <select class="grn-item-product">
                            ${productOptions(x.productId)}
                        </select>
                    </td>
                    <td>
                        <input class="grn-item-qty" type="number" min="1" step="1" value="${Number(x.quantity || 1)}" />
                    </td>
                    <td>
                        <input class="grn-item-price" type="number" min="0" step="1000" value="${Number(x.price || 0)}" />
                    </td>
                    <td class="line-total">${fmtMoney(amount)}</td>
                    <td>
                        <button class="btn danger grn-remove-row" type="button" data-remove-index="${idx}">Xóa</button>
                    </td>
                </tr>
            `;
        }).join("");

        tb.querySelectorAll(".grn-item-product, .grn-item-qty, .grn-item-price").forEach(el => {
            el.addEventListener("input", refreshSummary);
            el.addEventListener("change", refreshSummary);
        });

        tb.querySelectorAll("[data-remove-index]").forEach(btn => {
            btn.addEventListener("click", () => removeItemRow(Number(btn.dataset.removeIndex)));
        });

        updateSummary(safe);
    }

    // đọc dữ liệu chi tiết hiện có trên DOM để chuẩn bị validate hoặc submit

    function readItemsFromDom(strict = true) {
        const rows = Array.from(document.querySelectorAll("#grnItemsTbody tr"));
        const items = [];

        for (const row of rows) {
            const productId = row.querySelector(".grn-item-product")?.value?.trim() || "";
            const quantity = Number(row.querySelector(".grn-item-qty")?.value || 0);
            const price = Number(row.querySelector(".grn-item-price")?.value || 0);

            if (!productId && !strict) continue;
            items.push({ productId, quantity, price });
        }

        return items;
    }

    // cập nhật phần tổng hợp số dòng, số lượng và thành tiền trong modal

    function updateSummary(items) {
        const current = Array.isArray(items) ? items : readItemsFromDom(false);
        const totals = calcTotals(current);

        Array.from(document.querySelectorAll("#grnItemsTbody tr")).forEach(row => {
            const qty = Number(row.querySelector(".grn-item-qty")?.value || 0);
            const price = Number(row.querySelector(".grn-item-price")?.value || 0);
            const cell = row.querySelector(".line-total");
            if (cell) cell.textContent = fmtMoney(qty * price);
        });

        const linesEl = dom.byId("grnSummaryLines");
        const qtyEl = dom.byId("grnSummaryQty");
        const amountEl = dom.byId("grnSummaryAmount");

        if (linesEl) linesEl.textContent = String(totals.lines);
        if (qtyEl) qtyEl.textContent = String(totals.qty);
        if (amountEl) amountEl.textContent = fmtMoney(totals.amount);
    }

    // hàm bọc để refresh lại phần summary khi người dùng đổi dữ liệu

    function refreshSummary() {
        updateSummary();
    }

    // kiểm tra dữ liệu trước khi gọi API tạo/sửa phiếu nhập

    function validatePayload(supplierId, items) {
        if (!supplierId) return "Bạn chưa chọn supplier.";
        if (!items.length) return "Phiếu nhập phải có ít nhất 1 dòng hàng.";

        const seen = new Set();

        for (let i = 0; i < items.length; i++) {
            const x = items[i];

            if (!x.productId) return `Dòng ${i + 1} chưa chọn sản phẩm.`;
            if (!Number.isFinite(x.quantity) || x.quantity <= 0) return `Dòng ${i + 1} có số lượng không hợp lệ.`;
            if (!Number.isFinite(x.price) || x.price <= 0) return `Dòng ${i + 1} có đơn giá không hợp lệ.`;

            const key = String(x.productId).toLowerCase();
            if (seen.has(key)) return `Sản phẩm ở dòng ${i + 1} đang bị trùng.`;
            seen.add(key);
        }

        return "";
    }

    // gọi API tạo mới hoặc cập nhật phiếu nhập

    async function saveGrn() {
        const supplierId = dom.byId("grnSupplierId")?.value?.trim() || "";
        const items = readItemsFromDom(true);
        const validation = validatePayload(supplierId, items);

        if (validation) {
            msg.show("grnModalMsg", validation, "error");
            return;
        }

        const btn = dom.byId("grnSaveBtn");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Đang lưu...";
        }

        msg.show("grnModalMsg", "");

        let result;

        try {
            if (state.mode === "edit" && state.editId) {
                result = await http.request("PUT", `${API.grn}/${encodeURIComponent(state.editId)}`, { items });
            } else {
                result = await http.request("POST", API.grn, { supplierId, items });
            }

            if (!result.res) {
                msg.show("grnModalMsg", result.raw || "Không gọi được API.", "error");
                return;
            }

            if (!result.res.ok) {
                msg.show("grnModalMsg", http.getErrorText(result), "error");
                return;
            }

            const actionMode = state.mode;

            closeModal();

            if (actionMode === "create") {
                state.pageNumber = 1;
            }

            await loadGrns(false);

            msg.show("grnMsg", actionMode === "edit" ? "Cập nhật phiếu nhập thành công." : "Tạo phiếu nhập thành công.", "success");
            setTimeout(() => msg.show("grnMsg", ""), 1800);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Lưu";
            }
        }
    }

    // hỏi lại người dùng trước khi duyệt phiếu nhập

    function askComplete(id) {
        if (!confirm("Duyệt phiếu nhập này? Khi duyệt, tồn kho sản phẩm sẽ được cộng thêm.")) return;
        completeGrn(id);
    }

    // gọi API duyệt phiếu nhập

    async function completeGrn(id) {
        msg.show("grnMsg", "Đang duyệt phiếu nhập...", "warn");

        const result = await http.request("PUT", `${API.grn}/${encodeURIComponent(id)}/complete`);

        if (!result.res) {
            msg.show("grnMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("grnMsg", http.getErrorText(result), "error");
            return;
        }

        await loadGrns(false);
        msg.show("grnMsg", "Duyệt phiếu nhập thành công.", "success");
        setTimeout(() => msg.show("grnMsg", ""), 1800);
    }

    // hỏi lại người dùng trước khi hủy phiếu nhập

    function askCancel(id) {
        if (!confirm("Hủy phiếu nhập này?")) return;
        cancelGrn(id);
    }

    // gọi API hủy phiếu nhập

    async function cancelGrn(id) {
        msg.show("grnMsg", "Đang hủy phiếu nhập...", "warn");

        const result = await http.request("PUT", `${API.grn}/${encodeURIComponent(id)}/cancel`);

        if (!result.res) {
            msg.show("grnMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("grnMsg", http.getErrorText(result), "error");
            return;
        }

        await loadGrns(false);
        msg.show("grnMsg", "Hủy phiếu nhập thành công.", "success");
        setTimeout(() => msg.show("grnMsg", ""), 1800);
    }

    return {
        reload: loadGrns
    };
})();