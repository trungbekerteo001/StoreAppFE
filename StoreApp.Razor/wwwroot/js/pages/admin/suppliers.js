window.StoreApp = window.StoreApp || {};                // object toàn cục
window.StoreApp.pages = window.StoreApp.pages || {};    // object con để chứa logic riêng của từng page

    // IIFE - toàn bộ hàm và biến của page chỉ dùng trong phạm vi này để tránh xung đột tên
StoreApp.pages.adminSuppliers = (() => {
    const dom = StoreApp.dom;               // chứa các phương thức thao tác DOM
    const http = StoreApp.http;             // chứa phương thức request để gọi API
    const role = StoreApp.role;             // chứa phương thức guard và decode role/token
    const msg = StoreApp.message;           // chứa phương thức show để hiển thị thông báo
    const pager = StoreApp.pager;

    const API = {                       // chứa endpoint API dùng trong page này
        supplier: "/api/Supplier"
    };

    const state = {                     // state để lưu trạng thái hiện tại của page
        mode: "create",   // create | edit
        editId: null,     // id supplier đang sửa
        items: []    ,     // cache danh sách supplier hiện tại
        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        totalCount: 0
    };

        // khi DOM đã sẵn sàng thì gọi hàm initPage để khởi tạo page
    document.addEventListener("DOMContentLoaded", initPage);

    // hàm khởi tạo page: kiểm tra role, gán event và tải danh sách supplier

    async function initPage() {
        if (!role.guard(["Admin"])) return;

        bindEvents();
        await loadSuppliers();
    }

    // gom toàn bộ event của page supplier vào một chỗ

    function bindEvents() {
        dom.byId("btnSupSearch")?.addEventListener("click", searchSuppliers);
        dom.byId("btnSupClear")?.addEventListener("click", clearFilters);
        dom.byId("btnSupOpenCreate")?.addEventListener("click", openCreateModal);

        dom.byId("supPrevBtn")?.addEventListener("click", prevPage);
        dom.byId("supNextBtn")?.addEventListener("click", nextPage);

        dom.byId("btnSupCloseX")?.addEventListener("click", closeModal);
        dom.byId("btnSupCancel")?.addEventListener("click", closeModal);
        dom.byId("supModalBackdrop")?.addEventListener("click", closeModal);

        dom.byId("supSaveBtn")?.addEventListener("click", saveSupplier);

        dom.byId("kw")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                searchSuppliers();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeModal();
        });
    }

    // load danh sách supplier từ API, có hỗ trợ tìm kiếm theo keyword

    async function loadSuppliers(clearMessage = true) {
        if (clearMessage) {
            msg.show("supMsg", "");
        }

        const tb = dom.byId("supTbody");
        if (tb) {
            tb.innerHTML = `<tr><td colspan="6" class="muted">Đang tải...</td></tr>`;
        }

        const kw = dom.value("kw");
        const qs = new URLSearchParams();
        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));
        if (kw) qs.set("Keyword", kw);

        // gọi API lấy danh sách supplier với query string tương ứng, sau đó xử lý kết quả trả về
        const result = await http.request("GET", `${API.supplier}?${qs.toString()}`);

        if (!result.res) {
            msg.show("supMsg", result.raw || "Không gọi được API.", "error");
            if (tb) {
                tb.innerHTML = `<tr><td colspan="6" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            }
            return;
        }

        if (!result.res.ok) {
            msg.show("supMsg", http.getErrorText(result), "error");
            if (tb) {
                tb.innerHTML = `<tr><td colspan="6" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            }
            return;
        }

        state.items = Array.isArray(result.data)
            ? result.data.map(x => ({
                id: x.id,
                name: x.name,
                phone: x.phone,
                email: x.email,
                address: x.address
            }))
            : [];

        // đọc thông tin phân trang từ header response và cập nhật state
        const meta = pager.readMeta(result, state.items.length);
        state.pageNumber = Math.max(1, Number(meta.currentPage || 1));
        state.totalPages = Math.max(1, Number(meta.totalPages || 1));
        state.totalCount = Math.max(0, Number(meta.totalCount || 0));

        // sau khi có dữ liệu supplier mới thì gọi hàm render để hiển thị lên UI
        renderRows();
        renderPagerInfo();
    }

    // render supplier ra table và gán event cho nút sửa / xóa sau khi render

    function renderRows() {
        const tb = dom.byId("supTbody");
        if (!tb) return;

        if (!state.items || state.items.length === 0) {
            tb.innerHTML = `<tr><td colspan="6" class="muted">Không có dữ liệu.</td></tr>`;
            return;
        }

        tb.innerHTML = state.items.map((x, idx) => {
            const rowNo = ((state.pageNumber - 1) * state.pageSize) + idx + 1;

            return `
            <tr>
                <td>${rowNo}</td>
                <td>${dom.esc(x.name || "")}</td>
                <td>${dom.esc(x.phone || "")}</td>
                <td>${dom.esc(x.email || "")}</td>
                <td>${dom.esc(x.address || "")}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn" type="button" data-action="edit" data-id="${dom.escAttr(x.id)}">Sửa</button>
                        <button class="btn danger" type="button" data-action="delete" data-id="${dom.escAttr(x.id)}">Xóa</button>
                    </div>
                </td>
            </tr>
            `;
        }).join("");

                // gán sự kiện cho từng nút sửa sau khi render xong table
        tb.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener("click", () => openEditModal(btn.dataset.id));
        });

                // gán sự kiện cho từng nút xóa sau khi render xong table
        tb.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener("click", () => askDelete(btn.dataset.id));
        });
    }

    function renderPagerInfo() {
        const info = dom.byId("supPagerInfo");
        const prevBtn = dom.byId("supPrevBtn");
        const nextBtn = dom.byId("supNextBtn");

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
        loadSuppliers(false);
    }

    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;
        state.pageNumber++;
        loadSuppliers(false);
    }

    // tìm kiếm supplier theo keyword hiện tại

    function searchSuppliers() {
        state.pageNumber = 1;
        loadSuppliers();
    }

    // xóa keyword rồi tải lại danh sách supplier

    function clearFilters() {
        const kw = dom.byId("kw");
        if (kw) kw.value = "";
        state.pageNumber = 1;
        loadSuppliers();
    }

    // mở modal tạo mới supplier và reset toàn bộ input

    function openCreateModal() {
        state.mode = "create";
        state.editId = null;

        dom.setText("supModalTitle", "Thêm Supplier");

        setInputValue("supName", "");
        setInputValue("supPhone", "");
        setInputValue("supEmail", "");
        setInputValue("supAddress", "");

        msg.show("supModalMsg", "");
        openModal();
    }

    // mở modal sửa và đổ dữ liệu supplier đang chọn vào form

    function openEditModal(id) {
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        if (!item) {
            msg.show("supMsg", "Không tìm thấy supplier cần sửa.", "error");
            return;
        }

        state.mode = "edit";
        state.editId = item.id;

        dom.setText("supModalTitle", "Sửa Supplier");

        setInputValue("supName", item.name || "");
        setInputValue("supPhone", item.phone || "");
        setInputValue("supEmail", item.email || "");
        setInputValue("supAddress", item.address || "");

        msg.show("supModalMsg", "");
        openModal();
    }

    // mở modal supplier

    function openModal() {
        const modal = dom.byId("supModal");
        if (modal) modal.classList.add("show");

        setTimeout(() => {
            dom.byId("supName")?.focus();
        }, 0);
    }

    // đóng modal supplier

    function closeModal() {
        const modal = dom.byId("supModal");
        if (modal) modal.classList.remove("show");
    }

    // validate dữ liệu rồi gọi API create/update supplier

    async function saveSupplier() {
        const name = dom.value("supName");
        const phone = dom.value("supPhone");
        const email = dom.value("supEmail");
        const address = dom.value("supAddress");

        if (!name) {
            msg.show("supModalMsg", "Tên nhà cung cấp không được rỗng.", "error");
            return;
        }

        if (!phone) {
            msg.show("supModalMsg", "SĐT không được rỗng.", "error");
            return;
        }

        if (!email) {
            msg.show("supModalMsg", "Email không được rỗng.", "error");
            return;
        }

        if (!address) {
            msg.show("supModalMsg", "Địa chỉ không được rỗng.", "error");
            return;
        }

        const btn = dom.byId("supSaveBtn");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Đang lưu...";
        }

        msg.show("supModalMsg", "");

        let result;

        try {
            const body = { name, phone, email, address };

            if (state.mode === "edit" && state.editId) {
                result = await http.request(
                    "PUT",
                    `${API.supplier}/${encodeURIComponent(state.editId)}`,
                    body
                );
            } else {
                result = await http.request("POST", API.supplier, body);
            }

            if (!result.res) {
                msg.show("supModalMsg", result.raw || "Không gọi được API.", "error");
                return;
            }

            if (!result.res.ok) {
                msg.show("supModalMsg", http.getErrorText(result), "error");
                return;
            }

            const actionMode = state.mode;

            closeModal();
            await loadSuppliers(false);

            msg.show(
                "supMsg",
                actionMode === "create" ? "Tạo nhà cung cấp thành công." : "Cập nhật nhà cung cấp thành công.",
                "success"
            );
            setTimeout(() => msg.show("supMsg", ""), 1800);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Lưu";
            }
        }
    }

    // hỏi lại người dùng trước khi xóa supplier

    function askDelete(id) {
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        const label = item?.name ? `"${item.name}"` : "supplier này";

        if (!confirm(`Xóa ${label}?`)) return;

        deleteSupplier(id);
    }

    // gọi API xóa supplier rồi tải lại danh sách

    async function deleteSupplier(id) {
        msg.show("supMsg", "Đang xóa...", "warn");

        const result = await http.request("DELETE", `${API.supplier}/${encodeURIComponent(id)}`);

        if (!result.res) {
            msg.show("supMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("supMsg", http.getErrorText(result), "error");
            return;
        }

        if (state.items.length === 1 && state.pageNumber > 1) {
            state.pageNumber--;
        }

        await loadSuppliers(false);

        msg.show("supMsg", "Xóa nhà cung cấp thành công.", "success");
        setTimeout(() => msg.show("supMsg", ""), 1800);
    }

    // gán value cho input theo id

    function setInputValue(id, value) {
        const el = dom.byId(id);
        if (el) el.value = value ?? "";
    }

    return {
        reload: loadSuppliers
    };
})();