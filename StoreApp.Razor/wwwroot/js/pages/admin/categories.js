window.StoreApp = window.StoreApp || {};                // object toàn cục 
window.StoreApp.pages = window.StoreApp.pages || {};    // object con để chứa các page khác nhau, tránh xung đột tên hàm biến giữa các page

StoreApp.pages.adminCategories = (() => {       // IIFE - hàm và biến trong page chỉ đc dùng trong phạm vi này 
    const dom = StoreApp.dom;           // chứa các phương thức thao tác DOM
    const http = StoreApp.http;         // chứa phương thức request để gọi API
    const role = StoreApp.role;         // chứa phương thức guard để kiểm tra role truy cập page
    const msg = StoreApp.message;       // chứa phương thức show để hiển thị thông báo
    const pager = StoreApp.pager;

    const API = {                       // chứa endpoint API cho category
        category: "/api/category"
    };

    // state để lưu trữ trạng thái của page
    const state = {             
        mode: "create",   // create | edit
        editId: null,     // id category đang sửa
        items: []     ,    // cache danh sách category hiện tại
        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        totalCount: 0
    };

    // khi DOM đã sẵn sàng thì gọi hàm initPage để khởi tạo page
    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        if (!role.guard(["Admin"])) return;     // chỉ cho phép role Admin truy cập page này

        bindEvents();                           // gán các element và event vào biến 
        await loadCategories();                 // tải danh mục từ API và hiển thị lên bảng
    }

    function bindEvents() {
        dom.byId("btnCatSearch")?.addEventListener("click", searchCategories);      // gọi searchCategories
        dom.byId("btnCatClear")?.addEventListener("click", clearFilters);           // gọi clearFilters
        dom.byId("btnCatOpenCreate")?.addEventListener("click", openCreateModal);   // gọi openCreateModal

        dom.byId("catPrevBtn")?.addEventListener("click", prevPage);
        dom.byId("catNextBtn")?.addEventListener("click", nextPage);

        dom.byId("btnCatCloseX")?.addEventListener("click", closeModal);            // gọi closeModal cho nút X 
        dom.byId("btnCatCancel")?.addEventListener("click", closeModal);            // gọi closeModal khi ấn cancel 
        dom.byId("catModalBackdrop")?.addEventListener("click", closeModal);        // gọi closeModal khi ấn ra ngoài modal 

        dom.byId("catSaveBtn")?.addEventListener("click", saveCategory);            // gọi saveCategory

        dom.byId("kw")?.addEventListener("keydown", (e) => {                        
            if (e.key === "Enter") {                                                // ấn Enter 
                e.preventDefault();                                                 // chặn tải lại trang 
                searchCategories();                                                 
            }
        });

        document.addEventListener("keydown", (e) => {                               // gọi closeModal khi ấn esc 
            if (e.key === "Escape") closeModal();
        });
    }

    // hàm load category lên table, có lồng logic tìm kiếm 
    async function loadCategories(clearMessage = true) {
        // xóa msg cũ nếu cần 
        if (clearMessage) {
            msg.show("catMsg", "");
        }

        const tb = dom.byId("catTbody");
        // hiện trạng thái đang tải trong table 
        if (tb) {
            tb.innerHTML = `<tr><td colspan="3" class="muted">Đang tải...</td></tr>`;
        }

        // tạo queryString từ keyword 
        const kw = dom.value("kw");
        const qs = new URLSearchParams();

        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));
        if (kw) qs.set("Keyword", kw);

        // gọi API load list 
        const result = await http.request("GET", `${API.category}?${qs.toString()}`);

        if (!result.res) {      // lỗi không gọi đc API 
            msg.show("catMsg", result.raw || "Không gọi được API.", "error");
            if (tb) {
                tb.innerHTML = `<tr><td colspan="3" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            }
            return;
        }

        if (!result.res.ok) {   // API 400, 500...
            msg.show("catMsg", http.getErrorText(result), "error");
            if (tb) {
                tb.innerHTML = `<tr><td colspan="3" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            }
            return;
        }

        // giữ lại 2 trường cần dùng và lưu vào mảng items
        state.items = Array.isArray(result.data) ? result.data.map(x => ({
            id: x.id,
            name: x.name
        })) : [];

        // thông tin phân trang trả về từ header 
        const meta = pager.readMeta(result, state.items.length);
        state.pageNumber = Math.max(1, Number(meta.currentPage || 1));
        state.totalPages = Math.max(1, Number(meta.totalPages || 1));
        state.totalCount = Math.max(0, Number(meta.totalCount || 0));

        // render từng row cho table 
        renderRows();
        renderPagerInfo();
    }

    // đổ dữ liệu từ state.items ra HTML 
    function renderRows() {
        const tb = dom.byId("catTbody");
        if (!tb) return;

        // nếu không có data 
        if (!state.items || state.items.length === 0) {
            tb.innerHTML = `<tr><td colspan="3" class="muted">Không có dữ liệu.</td></tr>`;
            return;
        }

        // nếu có data thì chạy vòng lặp join đoạn HTML này vào table
        // idx là index vị trí hiện tại của phẩn tử trong mảng, init = 0
        tb.innerHTML = state.items.map((x, idx) => {
            const rowNo = ((state.pageNumber - 1) * state.pageSize) + idx + 1;

            return `
            <tr>
                <td>${rowNo}</td>
                <td>${dom.esc(x.name || "")}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn" type="button" data-action="edit" data-id="${dom.escAttr(x.id)}">Sửa</button>
                        <button class="btn danger" type="button" data-action="delete" data-id="${dom.escAttr(x.id)}">Xóa</button>
                    </div>
                </td>
            </tr>
            `;
        }).join("");

        // gán sự kiện cho từng btn của row sau khi render 
        tb.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener("click", () => openEditModal(btn.dataset.id));
            // vd nút được render là <button class="btn" type="button" data-action="edit" data-id=
            // thì btn.dataset.action là edit, btn.dataset.id là đoạn sau  
        });

        tb.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener("click", () => askDelete(btn.dataset.id));
            // vd nút được render là <button class="btn" type="button" data-action="delete" data-id=
            // thì btn.dataset.action là delete, btn.dataset.id là đoạn sau  
        });
    }

    function renderPagerInfo() {
        const info = dom.byId("catPagerInfo");
        const prevBtn = dom.byId("catPrevBtn");
        const nextBtn = dom.byId("catNextBtn");

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
        loadCategories(false);
    }

    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;
        state.pageNumber++;
        loadCategories(false);
    }

    // trong hàm load nó có sẵn tìm kiếm r
    function searchCategories() {
        state.pageNumber = 1;
        loadCategories();
    }

    // xóa keyword và tải lại category
    function clearFilters() {
        const kw = dom.byId("kw");
        if (kw) kw.value = "";
        state.pageNumber = 1;
        loadCategories();
    }

    // mở modal tạo mới, reset state về create và xóa input
    function openCreateModal() {
        state.mode = "create";
        state.editId = null;

        dom.setText("catModalTitle", "Thêm Category");
        setInputValue("catName", "");

        msg.show("catModalMsg", "");
        openModal();
    }

    // mở modal sửa, set state về edit và điền input bằng data của category cần sửa
    function openEditModal(id) {
        // tìm trong cache 
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        if (!item) {
            msg.show("catMsg", "Không tìm thấy category cần sửa.", "error");
            return;
        }

        // set state và điền input 
        state.mode = "edit";
        state.editId = item.id;

        dom.setText("catModalTitle", "Sửa Category");
        setInputValue("catName", item.name || "");

        msg.show("catModalMsg", "");
        openModal();
    }

    // mở modal bằng cách thêm class css và focus vào input
    function openModal() {
        const modal = dom.byId("catModal");
        if (modal) modal.classList.add("show");

        setTimeout(() => {
            dom.byId("catName")?.focus();
        }, 0);
    }

    // đóng modal bằng cách xóa class css
    function closeModal() {
        const modal = dom.byId("catModal");
        if (modal) modal.classList.remove("show");
    }

    // hàm lưu category
    // gọi API create hoặc edit tùy state.mode, xử lý kết quả trả về và hiển thị msg
    async function saveCategory() {
        const name = dom.value("catName");

        if (!name) {
            msg.show("catModalMsg", "Tên không được rỗng.", "error");
            return;
        }

        const btn = dom.byId("catSaveBtn");
        if (btn) {
            btn.disabled = true;    // disable btn để tránh gọi nhiều lần
            btn.textContent = "Đang lưu...";
        }

        msg.show("catModalMsg", "");    // xóa msg cũ

        let result;

        try {
            // tùy mode mà gọi API 
            if (state.mode === "edit" && state.editId) {
                result = await http.request("PUT", `${API.category}/${state.editId}`, { name });
            } else {
                result = await http.request("POST", API.category, { name });
            }

            if (!result.res) {          // lỗi không gọi đc API     
                msg.show("catModalMsg", result.raw || "Không gọi được API.", "error");
                return;
            }

            if (!result.res.ok) {       // API 400, 500...
                msg.show("catModalMsg", http.getErrorText(result), "error");
                return;
            }

            // nếu thành công thì đóng modal, tải lại category và hiển thị msg thành công
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
            // bất kể thành công hay lỗi thì cũng phải enable lại btn và reset text
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Lưu";
            }
        }
    }

    // hỏi lại trước khi xóa, nếu đồng ý thì gọi deleteCategory
    function askDelete(id) {
        // tìm trong cache theo id rồi lấy name 
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        const label = item?.name ? `"${item.name}"` : "category này";

        if (!confirm(`Xóa ${label}?`)) return;

        deleteCategory(id);
    }

    async function deleteCategory(id) {
        msg.show("catMsg", "Đang xóa...", "warn");

        // gọi API delete
        const result = await http.request("DELETE", `${API.category}/${encodeURIComponent(id)}`);

        if (!result.res) {      // lỗi không gọi đc API
            msg.show("catMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {   //  API 400, 500...
            msg.show("catMsg", http.getErrorText(result), "error");
            return;
        }

        // reload lại 
        await loadCategories(false);

        msg.show("catMsg", "Xóa danh mục thành công.", "success");
        setTimeout(() => msg.show("catMsg", ""), 1800);
    }

    // hàm tiện ích để set value cho input
    function setInputValue(id, value) {
        const el = dom.byId(id);
        if (el) el.value = value ?? "";
    }

    // giá trị trả về của IIFE, ở đây là một object có phương thức reload để các phần khác của app có thể gọi lại hàm loadCategories nếu cần
    return {
        reload: loadCategories
    };
})();