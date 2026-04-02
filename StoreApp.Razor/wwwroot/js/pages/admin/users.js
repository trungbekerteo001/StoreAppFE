window.StoreApp = window.StoreApp || {};                // object toàn cục
window.StoreApp.pages = window.StoreApp.pages || {};    // object con để chứa logic riêng của từng page

    // IIFE - toàn bộ hàm và biến của page chỉ dùng trong phạm vi này để tránh xung đột tên
StoreApp.pages.adminUsers = (() => {
    const dom = StoreApp.dom;               // chứa các phương thức thao tác DOM
    const http = StoreApp.http;             // chứa phương thức request để gọi API
    const role = StoreApp.role;             // chứa phương thức guard và decode role/token
    const msg = StoreApp.message;           // chứa phương thức show để hiển thị thông báo
    const pager = StoreApp.pager;           // chứa helper đọc metadata phân trang

    const API = {                       // chứa endpoint API dùng trong page này
        user: "/api/user"
    };

    const state = {                     // state để lưu trạng thái hiện tại của page
        mode: "create",     // create | edit
        editId: null,       // id user đang sửa

        items: [],          // cache danh sách user của trang hiện tại

        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        totalCount: 0
    };

        // khi DOM đã sẵn sàng thì gọi hàm initPage để khởi tạo page
    document.addEventListener("DOMContentLoaded", initPage);

    // hàm khởi tạo page: kiểm tra role, gán event và tải danh sách user

    async function initPage() {
        if (!role.guard(["Admin"])) return;

        bindEvents();
        await loadUsers();
    }

    // gom toàn bộ event của page user vào một chỗ để dễ quản lý

    function bindEvents() {
        dom.byId("btnUsrSearch")?.addEventListener("click", searchUsers);

        dom.byId("btnUsrClear")?.addEventListener("click", clearFilters);
        dom.byId("btnUsrOpenCreate")?.addEventListener("click", openCreateModal);

        dom.byId("usrPrevBtn")?.addEventListener("click", prevPage);
        dom.byId("usrNextBtn")?.addEventListener("click", nextPage);

        dom.byId("btnUsrCloseX")?.addEventListener("click", closeModal);
        dom.byId("btnUsrCancel")?.addEventListener("click", closeModal);

        dom.byId("usrSaveBtn")?.addEventListener("click", saveUser);

        dom.byId("kw")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                searchUsers();
            }
        });

        // click vào vùng tối bên ngoài panel để đóng modal
        dom.byId("usrModal")?.addEventListener("click", (e) => {
            if (e.target === dom.byId("usrModal")) {
                closeModal();
            }
        });

        // ESC để đóng modal
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeModal();
        });
    }

    // load danh sách user theo keyword + phân trang
    async function loadUsers(clearMessage = true) {
        if (clearMessage) {
            msg.show("usrMsg", "");
        }

        const tb = dom.byId("usrTbody");
        
        if (tb) {
            tb.innerHTML = `<tr><td colspan="6" class="muted">Đang tải...</td></tr>`;
        }

        const kw = dom.value("kw");
        const role = dom.byId("roleSelect");
        // tạo queryString để gửi filter / phân trang lên API
        const qs = new URLSearchParams();
        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));
        if (kw) qs.set("Keyword", kw);
        if (role) qs.set("role", String(role?.value?.trim() || ""));

        const result = await http.request("GET", `${API.user}?${qs.toString()}`);

        if (!result.res) {
            msg.show("usrMsg", result.raw || "Không gọi được API.", "error");
            if (tb) {
                tb.innerHTML = `<tr><td colspan="6" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            }
            return;
        }

        if (!result.res.ok) {
            msg.show("usrMsg", http.getErrorText(result), "error");
            if (tb) {
                tb.innerHTML = `<tr><td colspan="6" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            }
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

    // render từng user ra table và gán sự kiện cho nút sửa / xóa sau khi render

    function renderRows() {
        const tb = dom.byId("usrTbody");
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
                    <td>
                        <div class="cell-main">${dom.esc(x.username)}</div>
                        <div class="cell-sub">${dom.esc(x.id)}</div>
                    </td>
                    <td>${dom.esc(x.fullName)}</td>
                    <td>${dom.esc(x.phone)}</td>
                    <td><span class="badge">${dom.esc(x.role)}</span></td>
                    <td>
                        <div class="actions">
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

    // hiển thị thông tin phân trang và trạng thái nút Prev Next

    function renderPagerInfo() {
        const info = dom.byId("usrPagerInfo");
        const prevBtn = dom.byId("usrPrevBtn");
        const nextBtn = dom.byId("usrNextBtn");

        if (info) {
            const from = state.totalCount === 0 ? 0 : ((state.pageNumber - 1) * state.pageSize) + 1;
            const to = Math.min(state.pageNumber * state.pageSize, state.totalCount);
            info.textContent = `Trang ${state.pageNumber} / ${state.totalPages} • ${from}-${to} / ${state.totalCount}`;
        }

        if (prevBtn) prevBtn.disabled = state.pageNumber <= 1;
        if (nextBtn) nextBtn.disabled = state.pageNumber >= state.totalPages;
    }

    // tìm kiếm lại danh sách user từ trang 1

    function searchUsers() {
        state.pageNumber = 1;
        loadUsers();
    }

    // xóa keyword rồi tải lại dữ liệu từ trang đầu

    function clearFilters() {
        const kw = dom.byId("kw");
        const role = dom.byId("roleSelect");
        if (kw) kw.value = "";
        if (role) role.value = "";

        state.pageNumber = 1;
        loadUsers();
    }

    // lùi về trang trước

    function prevPage() {
        if (state.pageNumber <= 1) return;
        state.pageNumber--;
        loadUsers(false);
    }

    // sang trang tiếp theo

    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;
        state.pageNumber++;
        loadUsers(false);
    }

    // mở modal tạo mới user và reset form

    function openCreateModal() {
        state.mode = "create";
        state.editId = null;

        dom.setText("usrModalTitle", "Thêm User");
        dom.setText("usrModalSub", "Tạo mới người dùng");

        setInputValue("usrUserName", "");
        setInputValue("usrFullName", "");
        setInputValue("usrPhone", "");
        setInputValue("usrRole", "Staff");
        setInputValue("usrPassword", "");
        setPasswordVisible(true);

        setPwdHintText("Nhập mật khẩu khi tạo mới");
        setPwdHintVisible(false);

        msg.show("usrModalMsg", "");
        openModal();
    }

    // mở modal sửa user và đổ dữ liệu hiện tại vào form

    function openEditModal(id) {
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        if (!item) {
            msg.show("usrMsg", "Không tìm thấy user cần sửa.", "error");
            return;
        }

        state.mode = "edit";
        state.editId = id;

        dom.setText("usrModalTitle", "Sửa User");
        dom.setText("usrModalSub", `ID: ${id}`);

        setInputValue("usrUserName", item.username || "");
        setInputValue("usrFullName", item.fullName || "");
        setInputValue("usrPhone", item.phone || "");
        setInputValue("usrRole", item.role || "Staff");
        setInputValue("usrPassword", "");
        setPasswordVisible(false);

        setPwdHintText("BE không đổi password");
        setPwdHintVisible(false);

        msg.show("usrModalMsg", "");
        openModal();
    }

    // validate dữ liệu rồi gọi API tạo mới hoặc cập nhật user

    async function saveUser() {
        const userName = dom.value("usrUserName");
        const fullName = dom.value("usrFullName");
        const phone = dom.value("usrPhone");
        const roleValue = dom.byId("usrRole")?.value?.trim() || "Staff";
        const password = dom.byId("usrPassword")?.value ?? "";

        if (!userName) {
            msg.show("usrModalMsg", "Username không được rỗng.", "error");
            return;
        }

        if (!fullName) {
            msg.show("usrModalMsg", "Họ tên không được rỗng.", "error");
            return;
        }

        if (!phone) {
            msg.show("usrModalMsg", "SĐT không được rỗng.", "error");
            return;
        }

        if (state.mode === "create" && !String(password).trim()) {
            msg.show("usrModalMsg", "Mật khẩu không được rỗng khi tạo mới.", "error");
            return;
        }

        const payload = {
            userName,
            fullName,
            phone,
            role: roleValue
        };

        // chỉ gửi password khi tạo mới
        if (state.mode === "create") {
            payload.password = String(password);
        }

        const saveBtn = dom.byId("usrSaveBtn");
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = "Đang lưu...";
        }

        msg.show("usrModalMsg", "");

        try {
            let result;

            if (state.mode === "create") {
                result = await http.request("POST", API.user, payload);
            } else {
                result = await http.request("PUT", `${API.user}/${encodeURIComponent(state.editId)}`, payload);
            }

            if (!result.res) {
                msg.show("usrModalMsg", result.raw || "Không gọi được API.", "error");
                return;
            }

            if (!result.res.ok) {
                msg.show("usrModalMsg", http.getErrorText(result), "error");
                return;
            }

            const actionMode = state.mode;

            closeModal();

            if (actionMode === "create") {
                state.pageNumber = 1;
            }

            await loadUsers(false);

            msg.show("usrMsg", actionMode === "create" ? "Tạo user thành công." : "Cập nhật user thành công.", "success");
            setTimeout(() => msg.show("usrMsg", ""), 1800);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = "Lưu";
            }
        }
    }

    // hỏi lại người dùng trước khi xóa user

    function askDelete(id) {
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        const name = item?.username || id;

        if (!confirm(`Xóa user "${name}" ?`)) return;

        deleteUser(id);
    }

    // gọi API xóa user rồi tải lại danh sách

    async function deleteUser(id) {
        const result = await http.request("DELETE", `${API.user}/${encodeURIComponent(id)}`);

        if (!result.res) {
            msg.show("usrMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("usrMsg", http.getErrorText(result), "error");
            return;
        }

        if (state.items.length === 1 && state.pageNumber > 1) {
            state.pageNumber--;
        }

        await loadUsers(false);

        msg.show("usrMsg", "Xóa user thành công.", "success");
        setTimeout(() => msg.show("usrMsg", ""), 1800);
    }

    // mở modal user

    function openModal() {
        const modal = dom.byId("usrModal");
        if (modal) modal.classList.add("show");

        setTimeout(() => {
            dom.byId("usrUserName")?.focus();
        }, 0);
    }

    // đóng modal user

    function closeModal() {
        const modal = dom.byId("usrModal");
        if (modal) modal.classList.remove("show");
    }

    // gán value cho input/select theo id

    function setInputValue(id, value) {
        const el = dom.byId(id);
        if (el) el.value = value ?? "";
    }

    // ẩn/hiện dòng ghi chú về mật khẩu khi sửa user
    function setPwdHintText(text) {
        const hint = dom.byId("usrPwdHint");
        if (!hint) return;
        hint.textContent = text || "";
    }

    // ẩn/hiện trường mật khẩu khi sửa user
    function setPasswordVisible(visible) {
        const wrap = dom.byId("usrPasswordWrap");
        if (!wrap) return;
        wrap.style.display = visible ? "block" : "none";
    }

    // ẩn/hiện dòng ghi chú về mật khẩu khi sửa user

    function setPwdHintVisible(visible) {
        const hint = dom.byId("usrPwdHint");
        if (!hint) return;
        hint.style.display = visible ? "block" : "none";
    }

    return {
        reload: loadUsers
    };
})();