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

    // hàm lấy userId hiện tại từ token để tránh tự xóa hoặc sửa user đang đăng nhập
    function getCurrentUserIdFromToken() {
        const token = StoreApp.auth?.getAccessToken?.();
        if (!token) return "";

        try {
            // decode payload của token để lấy userId
            const payloadBase64 = token.split(".")[1]
                .replace(/-/g, "+")
                .replace(/_/g, "/");

            // atob để decode base64, JSON.parse để parse chuỗi JSON thành object
            const payload = JSON.parse(atob(payloadBase64));

            // các hệ thống có thể dùng claim nameidentifier khác nhau, ưu tiên theo thứ tự: WS 2005 > WS 2008 > nameid > sub
            return String(
                payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ||
                payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/nameidentifier"] ||
                payload["nameid"] ||
                payload["sub"] ||
                ""
            );
        } catch {
            return "";
        }
    }

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

        // tạo queryString để gửi filter / phân trang lên API
        const qs = new URLSearchParams();
        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));
        if (kw) qs.set("Keyword", kw);

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

        // lấy userId hiện tại để disable nút sửa/xóa nếu đang hiển thị user đó
        const currentUserId = String(getCurrentUserIdFromToken()).toLowerCase();

        tb.innerHTML = state.items.map((x, idx) => {
            const rowNo = ((state.pageNumber - 1) * state.pageSize) + idx + 1;
            const isMe = String(x.id || "").toLowerCase() === currentUserId;

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
                        ${x.isLocked
                        ? `<span class="badge danger">Đã khóa</span>`
                        : `<span class="badge success">Hoạt động</span>`
                        }
                    </td>
                    <td>
                        <div class="actions">
                            <button class="btn" type="button" data-action="edit" data-id="${dom.escAttr(x.id)}">Sửa</button>
                            ${isMe
                                ? `<button class="btn" type="button" disabled title="Không thể tự khóa/xóa">Chính bạn</button>`
                                : `${x.isLocked
                                    ? `<button class="btn primary" type="button" data-action="unlock" data-id="${dom.escAttr(x.id)}">Mở khóa</button>`
                                    : `<button class="btn warn" type="button" data-action="lock" data-id="${dom.escAttr(x.id)}">Khóa</button>`
                                }
                            <button class="btn danger" type="button" data-action="delete" data-id="${dom.escAttr(x.id)}">Xóa</button>`
                            }
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

        tb.querySelectorAll('[data-action="lock"]').forEach(btn => {
            btn.addEventListener("click", () => askLock(btn.dataset.id));
        });

        tb.querySelectorAll('[data-action="unlock"]').forEach(btn => {
            btn.addEventListener("click", () => askUnlock(btn.dataset.id));
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
        if (kw) kw.value = "";

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
        const currentUserId = String(getCurrentUserIdFromToken()).toLowerCase();

        if (String(id).toLowerCase() === currentUserId) {
            msg.show("usrMsg", "Bạn không thể tự xóa chính mình khi đang đăng nhập.", "error");
            return;
        }

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

    function askLock(id) {
        const currentUserId = String(getCurrentUserIdFromToken()).toLowerCase();

        if (String(id).toLowerCase() === currentUserId) {
            msg.show("usrMsg", "Bạn không thể tự khóa tài khoản đang đăng nhập.", "error");
            return;
        }

        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        const name = item?.username || id;
        if (!confirm(`Khóa tài khoản "${name}" ?`)) return;
        changeLockStatus(id, true);
    }

    function askUnlock(id) {
        const item = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        const name = item?.username || id;
        if (!confirm(`Mở khóa tài khoản "${name}" ?`)) return;
        changeLockStatus(id, false);
    }

    async function changeLockStatus(id, shouldLock) {
        const action = shouldLock ? "lock" : "unlock";
        const result = await http.request("PUT", `${API.user}/${encodeURIComponent(id)}/${action}`);

        if (!result.res) {
            msg.show("usrMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("usrMsg", http.getErrorText(result), "error");
            return;
        }

        await loadUsers(false);

        msg.show("usrMsg", shouldLock ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản.", "success");
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