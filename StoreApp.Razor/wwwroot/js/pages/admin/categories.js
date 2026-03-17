window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.adminCategories = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const role = StoreApp.role;
    const msg = StoreApp.message;

    const API = {
        category: "/api/category"
    };

    const state = {
        mode: "create",   // create | edit
        editId: null,     // id category đang sửa
        items: []         // cache danh sách category hiện tại
    };

    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        if (!role.guard(["Admin"])) return;

        bindEvents();
        await loadCategories();
    }

    function bindEvents() {
        dom.byId("btnCatSearch")?.addEventListener("click", searchCategories);
        dom.byId("btnCatClear")?.addEventListener("click", clearFilters);
        dom.byId("btnCatOpenCreate")?.addEventListener("click", openCreateModal);

        dom.byId("btnCatCloseX")?.addEventListener("click", closeModal);
        dom.byId("btnCatCancel")?.addEventListener("click", closeModal);
        dom.byId("catModalBackdrop")?.addEventListener("click", closeModal);

        dom.byId("catSaveBtn")?.addEventListener("click", saveCategory);

        dom.byId("kw")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                searchCategories();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeModal();
        });
    }

    async function loadCategories(clearMessage = true) {
        if (clearMessage) {
            msg.show("catMsg", "");
        }

        const tb = dom.byId("catTbody");
        if (tb) {
            tb.innerHTML = `<tr><td colspan="3" class="muted">Đang tải...</td></tr>`;
        }

        const kw = dom.value("kw");
        const qs = kw ? `?Keyword=${encodeURIComponent(kw)}` : "";

        const result = await http.request("GET", `${API.category}${qs}`);

        if (!result.res) {
            msg.show("catMsg", result.raw || "Không gọi được API.", "error");
            if (tb) {
                tb.innerHTML = `<tr><td colspan="3" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            }
            return;
        }

        if (!result.res.ok) {
            msg.show("catMsg", http.getErrorText(result), "error");
            if (tb) {
                tb.innerHTML = `<tr><td colspan="3" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            }
            return;
        }

        state.items = Array.isArray(result.data) ? result.data.map(x => ({
            id: x.id,
            name: x.name
        })) : [];

        renderRows();
    }

    function renderRows() {
        const tb = dom.byId("catTbody");
        if (!tb) return;

        if (!state.items || state.items.length === 0) {
            tb.innerHTML = `<tr><td colspan="3" class="muted">Không có dữ liệu.</td></tr>`;
            return;
        }

        tb.innerHTML = state.items.map((x, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${dom.esc(x.name || "")}</td>
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

    function searchCategories() {
        loadCategories();
    }

    function clearFilters() {
        const kw = dom.byId("kw");
        if (kw) kw.value = "";
        loadCategories();
    }

    function openCreateModal() {
        state.mode = "create";
        state.editId = null;

        dom.setText("catModalTitle", "Thêm Category");
        setInputValue("catName", "");

        msg.show("catModalMsg", "");
        openModal();
    }

    function openEditModal(id) {
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        if (!item) {
            msg.show("catMsg", "Không tìm thấy category cần sửa.", "error");
            return;
        }

        state.mode = "edit";
        state.editId = item.id;

        dom.setText("catModalTitle", "Sửa Category");
        setInputValue("catName", item.name || "");

        msg.show("catModalMsg", "");
        openModal();
    }

    function openModal() {
        const modal = dom.byId("catModal");
        if (modal) modal.classList.add("show");

        setTimeout(() => {
            dom.byId("catName")?.focus();
        }, 0);
    }

    function closeModal() {
        const modal = dom.byId("catModal");
        if (modal) modal.classList.remove("show");
    }

    async function saveCategory() {
        const name = dom.value("catName");

        if (!name) {
            msg.show("catModalMsg", "Tên không được rỗng.", "error");
            return;
        }

        const btn = dom.byId("catSaveBtn");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Đang lưu...";
        }

        msg.show("catModalMsg", "");

        let result;

        try {
            if (state.mode === "edit" && state.editId) {
                result = await http.request("PUT", `${API.category}/${encodeURIComponent(state.editId)}`, { name });
            } else {
                result = await http.request("POST", API.category, { name });
            }

            if (!result.res) {
                msg.show("catModalMsg", result.raw || "Không gọi được API.", "error");
                return;
            }

            if (!result.res.ok) {
                msg.show("catModalMsg", http.getErrorText(result), "error");
                return;
            }

            const actionMode = state.mode;

            closeModal();
            await loadCategories(false);

            msg.show(
                "catMsg",
                actionMode === "create" ? "Tạo danh mục thành công." : "Cập nhật danh mục thành công.",
                "success"
            );
            setTimeout(() => msg.show("catMsg", ""), 1800);
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

        const label = item?.name ? `"${item.name}"` : "category này";

        if (!confirm(`Xóa ${label}?`)) return;

        deleteCategory(id);
    }

    async function deleteCategory(id) {
        msg.show("catMsg", "Đang xóa...", "warn");

        const result = await http.request("DELETE", `${API.category}/${encodeURIComponent(id)}`);

        if (!result.res) {
            msg.show("catMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("catMsg", http.getErrorText(result), "error");
            return;
        }

        await loadCategories(false);

        msg.show("catMsg", "Xóa danh mục thành công.", "success");
        setTimeout(() => msg.show("catMsg", ""), 1800);
    }

    function setInputValue(id, value) {
        const el = dom.byId(id);
        if (el) el.value = value ?? "";
    }

    return {
        reload: loadCategories
    };
})();