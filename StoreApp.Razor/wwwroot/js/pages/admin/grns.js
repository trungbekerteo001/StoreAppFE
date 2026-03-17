window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.adminGrn = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const role = StoreApp.role;
    const msg = StoreApp.message;
    const pager = StoreApp.pager;

    const API = {
        grn: "/api/GRN",
        supplier: "/api/Supplier",
        product: "/api/Product"
    };

    const state = {
        mode: "create",          // create | edit | view
        editId: null,

        items: [],               // list GRN trang hiện tại
        suppliers: [],           // cache supplier
        products: [],            // cache product

        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        totalCount: 0
    };

    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        if (!role.guard(["Admin"])) return;

        bindEvents();
        await loadMeta();
        await loadGrns();
    }

    function bindEvents() {
        dom.byId("btnGrnSearch")?.addEventListener("click", searchGrns);
        dom.byId("btnGrnClear")?.addEventListener("click", clearFilters);
        dom.byId("btnGrnOpenCreate")?.addEventListener("click", openCreateModal);

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

    async function loadMeta() {
        const supRes = await http.request("GET", `${API.supplier}?PageSize=100`);
        state.suppliers = (supRes?.res?.ok && Array.isArray(supRes.data)) ? supRes.data : [];

        const prodRes = await http.request("GET", `${API.product}?PageSize=100`);
        state.products = (prodRes?.res?.ok && Array.isArray(prodRes.data)) ? prodRes.data : [];

        fillSelect("grnSupplierFilter", state.suppliers, "-- Tất cả Supplier --", x => x.name || x.id);
        fillSelect("grnSupplierId", state.suppliers, "-- Chọn Supplier --", x => x.name || x.id);
    }

    function fillSelect(id, items, firstText, labelFn) {
        const el = dom.byId(id);
        if (!el) return;

        const opts = [];
        if (firstText !== undefined && firstText !== null) {
            opts.push(`<option value="">${dom.esc(firstText)}</option>`);
        }

        for (const x of (items || [])) {
            const label = typeof labelFn === "function"
                ? labelFn(x)
                : (x.name || x.productName || x.id);

            opts.push(`<option value="${dom.escAttr(x.id)}">${dom.esc(label)}</option>`);
        }

        el.innerHTML = opts.join("");
    }

    function supplierName(id) {
        const item = state.suppliers.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );
        return item?.name || "";
    }

    function productName(id) {
        const item = state.products.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );
        return item?.productName || "";
    }

    function safeItems(items) {
        return Array.isArray(items)
            ? items.map(x => ({
                productId: x.productId || "",
                quantity: Number(x.quantity || 0),
                price: Number(x.price || 0)
            }))
            : [];
    }

    function calcTotals(items) {
        return safeItems(items).reduce((acc, x) => {
            acc.lines += 1;
            acc.qty += Number(x.quantity || 0);
            acc.amount += Number(x.quantity || 0) * Number(x.price || 0);
            return acc;
        }, { lines: 0, qty: 0, amount: 0 });
    }

    function statusText(status) {
        const s = String(status || "").toLowerCase();
        if (s === "completed") return "Completed";
        if (s === "canceled") return "Canceled";
        return "Pending";
    }

    function statusClass(status) {
        const s = String(status || "").toLowerCase();
        if (s === "completed") return "completed";
        if (s === "canceled") return "canceled";
        return "pending";
    }

    function shortId(v, len = 10) {
        const s = String(v || "");
        return s.length > len ? `${s.slice(0, len)}...` : s;
    }

    function fmtMoney(v) {
        const n = Number(v || 0);
        return `${n.toLocaleString("vi-VN")} ₫`;
    }

    function fmtDate(v) {
        if (!v) return "—";
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return String(v);
        return d.toLocaleString("vi-VN");
    }

    async function loadGrns(clearMessage = true) {
        if (clearMessage) msg.show("grnMsg", "");

        const supplierId = dom.byId("grnSupplierFilter")?.value?.trim() || "";
        const status = dom.byId("grnStatusFilter")?.value?.trim() || "";

        const qs = new URLSearchParams();
        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));

        if (supplierId) qs.set("Supplier", supplierId);
        if (status) qs.set("GRNStatus", status);

        const tb = dom.byId("grnTbody");
        if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Đang tải...</td></tr>`;

        const result = await http.request("GET", `${API.grn}?${qs.toString()}`);

        if (!result.res) {
            msg.show("grnMsg", result.raw || "Không gọi được API.", "error");
            if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            return;
        }

        if (!result.res.ok) {
            msg.show("grnMsg", http.getErrorText(result), "error");
            if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
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

    function renderRows() {
        const tb = dom.byId("grnTbody");
        if (!tb) return;

        if (!state.items.length) {
            tb.innerHTML = `<tr><td colspan="9" class="muted">Không có dữ liệu.</td></tr>`;
            return;
        }

        tb.innerHTML = state.items.map((x, idx) => {
            const supplier = supplierName(x.supplierId) || x.supplierId || "—";
            const totals = calcTotals(x.items);
            const canEdit = String(x.grnStatus || "").toLowerCase() === "pending";
            const rowNo = ((state.pageNumber - 1) * state.pageSize) + idx + 1;

            return `
                <tr>
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
    }

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

    function prevPage() {
        if (state.pageNumber <= 1) return;
        state.pageNumber--;
        loadGrns(false);
    }

    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;
        state.pageNumber++;
        loadGrns(false);
    }

    function searchGrns() {
        state.pageNumber = 1;
        loadGrns();
    }

    function clearFilters() {
        const sup = dom.byId("grnSupplierFilter");
        const status = dom.byId("grnStatusFilter");

        if (sup) sup.value = "";
        if (status) status.value = "";

        state.pageNumber = 1;
        loadGrns();
    }

    function setModalMeta(title, sub) {
        const titleEl = dom.byId("grnModalTitle");
        const subEl = dom.byId("grnModalSub");

        if (titleEl) titleEl.textContent = title;
        if (subEl) subEl.textContent = sub;
    }

    function setValue(id, value) {
        const el = dom.byId(id);
        if (el) el.value = value ?? "";
    }

    function openModal() {
        const m = dom.byId("grnModal");
        if (m) m.classList.add("show");
        setTimeout(() => dom.byId("grnSupplierId")?.focus(), 0);
    }

    function closeModal() {
        const m = dom.byId("grnModal");
        if (m) m.classList.remove("show");
    }

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

    async function openView(id) {
        await openExisting(id, "view");
    }

    async function openEdit(id) {
        await openExisting(id, "edit");
    }

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

    function addItemRow() {
        const current = readItemsFromDom(false);
        current.push({ productId: "", quantity: 1, price: 0 });

        renderItemRows(current);
        applyModalState();
    }

    function removeItemRow(index) {
        const current = readItemsFromDom(false);
        current.splice(index, 1);

        renderItemRows(current.length ? current : [{ productId: "", quantity: 1, price: 0 }]);
        applyModalState();
    }

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

    function refreshSummary() {
        updateSummary();
    }

    function validatePayload(supplierId, items) {
        if (!supplierId) return "Bạn chưa chọn supplier.";
        if (!items.length) return "Phiếu nhập phải có ít nhất 1 dòng hàng.";

        const seen = new Set();

        for (let i = 0; i < items.length; i++) {
            const x = items[i];

            if (!x.productId) return `Dòng ${i + 1} chưa chọn sản phẩm.`;
            if (!Number.isFinite(x.quantity) || x.quantity <= 0) return `Dòng ${i + 1} có số lượng không hợp lệ.`;
            if (!Number.isFinite(x.price) || x.price < 0) return `Dòng ${i + 1} có đơn giá không hợp lệ.`;

            const key = String(x.productId).toLowerCase();
            if (seen.has(key)) return `Sản phẩm ở dòng ${i + 1} đang bị trùng.`;
            seen.add(key);
        }

        return "";
    }

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

    function askComplete(id) {
        if (!confirm("Duyệt phiếu nhập này? Khi duyệt, tồn kho sản phẩm sẽ được cộng thêm.")) return;
        completeGrn(id);
    }

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

    function askCancel(id) {
        if (!confirm("Hủy phiếu nhập này?")) return;
        cancelGrn(id);
    }

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