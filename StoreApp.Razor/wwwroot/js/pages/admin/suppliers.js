window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.adminSuppliers = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const role = StoreApp.role;
    const msg = StoreApp.message;

    const API = {
        supplier: "/api/Supplier"
    };

    const state = {
        mode: "create",   // create | edit
        editId: null,     // id supplier đang sửa
        items: []         // cache danh sách supplier hiện tại
    };

    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        if (!role.guard(["Admin"])) return;

        bindEvents();
        await loadSuppliers();
    }

    function bindEvents() {
        dom.byId("btnSupSearch")?.addEventListener("click", searchSuppliers);
        dom.byId("btnSupClear")?.addEventListener("click", clearFilters);
        dom.byId("btnSupOpenCreate")?.addEventListener("click", openCreateModal);

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

    async function loadSuppliers(clearMessage = true) {
        if (clearMessage) {
            msg.show("supMsg", "");
        }

        const tb = dom.byId("supTbody");
        if (tb) {
            tb.innerHTML = `<tr><td colspan="6" class="muted">Đang tải...</td></tr>`;
        }

        const kw = dom.value("kw");
        const qs = kw ? `?Keyword=${encodeURIComponent(kw)}` : "";

        const result = await http.request("GET", `${API.supplier}${qs}`);

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

        renderRows();
    }

    function renderRows() {
        const tb = dom.byId("supTbody");
        if (!tb) return;

        if (!state.items || state.items.length === 0) {
            tb.innerHTML = `<tr><td colspan="6" class="muted">Không có dữ liệu.</td></tr>`;
            return;
        }

        tb.innerHTML = state.items.map((x, idx) => `
            <tr>
                <td>${idx + 1}</td>
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
        `).join("");

        tb.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener("click", () => openEditModal(btn.dataset.id));
        });

        tb.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener("click", () => askDelete(btn.dataset.id));
        });
    }

    function searchSuppliers() {
        loadSuppliers();
    }

    function clearFilters() {
        const kw = dom.byId("kw");
        if (kw) kw.value = "";
        loadSuppliers();
    }

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

    function openModal() {
        const modal = dom.byId("supModal");
        if (modal) modal.classList.add("show");

        setTimeout(() => {
            dom.byId("supName")?.focus();
        }, 0);
    }

    function closeModal() {
        const modal = dom.byId("supModal");
        if (modal) modal.classList.remove("show");
    }

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

    function askDelete(id) {
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        const label = item?.name ? `"${item.name}"` : "supplier này";

        if (!confirm(`Xóa ${label}?`)) return;

        deleteSupplier(id);
    }

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

        await loadSuppliers(false);

        msg.show("supMsg", "Xóa nhà cung cấp thành công.", "success");
        setTimeout(() => msg.show("supMsg", ""), 1800);
    }

    function setInputValue(id, value) {
        const el = dom.byId(id);
        if (el) el.value = value ?? "";
    }

    return {
        reload: loadSuppliers
    };
})();