// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

// Thêm một thuộc tính tên là http vào object StoreApp
// chứa các phương thức để gửi request tới API
StoreApp.http = {
    // ghép base URL với path truyền vào để tạo thành URL đầy đủ
    buildUrl(path) {
        const base = StoreApp.config?.apiBaseUrl;   // lấy base URL từ config.js
        if (!base) throw new Error("Thiếu StoreApp.config.apiBaseUrl.");    
        return base.replace(/\/$/, "") + path;      // xóa dấu / ở cuối base để tránh lỗi khi ghép với path 
    },

    // tạo ra header cho request
    authHeaders(extra, token) {
        // tạo header mặc định có "Content-Type": "application/json" để gửi dữ liệu dạng JSON
        // nếu có extra truyền vào, ví dụ { "X-Custom-Header": "value" }
        const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
        // nếu có token truyền vào thì dùng token đó, nếu không thì lấy token từ StoreApp.auth.getAccessToken()
        const accessToken = token || StoreApp.auth.getAccessToken();
        if (accessToken) h["Authorization"] = "Bearer " + accessToken;  // giúp các API cần đăng nhập tự nhận biết user hiện tại
        return h;
    },

    // gửi request tới API với method, path và body tùy ý
    async request(method, path, body) {
        // method: GET, POST, PUT, DELETE
        // path: đường dẫn API, ví dụ "/api/Product"
        // body: dữ liệu gửi đi
        try {
            // gửi request với tự động refresh token nếu bị 401
            const res = await this.fetchWithAutoRefresh(path, { // thay vì gọi fetch trực tiếp thì gọi fetchWithAutoRefresh để có thể tự động refresh token nếu bị 401
                method,
                headers: { "Content-Type": "application/json" },
                body: body === undefined ? undefined : JSON.stringify(body)
            });

            const raw = await res.text();

            // cố gắng parse JSON, nếu lỗi thì data sẽ là null
            let data = null;
            if (raw) {
                // data là object JSON 
                try { data = JSON.parse(raw); } catch { }
            }

            // luôn trả về 3 thứ 
            return { res, data, raw };
        } catch (err) {     // nếu lỗi fetch 
            return { res: null, data: null, raw: String(err) };
        }
    },

    // gửi request với tự động refresh token nếu bị 401
    async fetchWithAutoRefresh(path, init, options = {}) {
        // options có thể có retryOn401 để quyết định có tự động refresh token khi bị 401 hay không, mặc định là true
        const { retryOn401 = true } = options;

        let token = await StoreApp.auth.ensureAccessToken();
        // tạo reqInit từ init truyền vào, nếu init không có headers thì tạo mới headers rỗng
        let reqInit = Object.assign({}, init || {});
        // đảm bảo reqInit có headers, nếu init không có headers thì tạo mới headers rỗng
        reqInit.headers = Object.assign({}, reqInit.headers || {});

        // nếu có token thì gán vào header Authorization
        if (token) {
            reqInit.headers["Authorization"] = "Bearer " + token;
        }

        let res = await fetch(this.buildUrl(path), reqInit);

        // nếu bị 401 và có retryOn401 và có refresh token thì thử refresh token
        if (res.status === 401 && retryOn401 && StoreApp.auth.getRefreshToken()) {
            const ok = await StoreApp.auth.refreshAccessToken();

            if (ok) {
                token = StoreApp.auth.getAccessToken();
                // tạo reqInit mới từ init truyền vào, nếu init không có headers thì tạo mới headers rỗng
                reqInit = Object.assign({}, init || {});
                // đảm bảo reqInit có headers, nếu init không có headers thì tạo mới headers rỗng
                reqInit.headers = Object.assign({}, reqInit.headers || {});
                // gán lại token mới vào header Authorization
                if (token) {
                    reqInit.headers["Authorization"] = "Bearer " + token;
                }

                res = await fetch(this.buildUrl(path), reqInit);
            } else {
                // nếu refresh token không thành công thì chuyển hướng về trang login để đăng nhập lại
                window.location.href = "/Auth/Login";
            }
        }

        return res;
    },

    // chuẩn hóa lỗi từ API để hiển thị
    getErrorText(result) {
        if (result?.data?.errors) {     
            // làm phẳng mảng 2 chiều -> 1 chiều, sau đó lọc bỏ các giá trị falsy (null, undefined, "") để tránh lỗi khi join
            const errors = Object.values(result.data.errors).flat().filter(Boolean);
            if (errors.length) return errors.join("\n");
        }

        // lỗi validator nằm trong detail, lỗi handler nằm trong message 
        return result?.data?.detail || result?.data?.message || result?.raw || "Có lỗi xảy ra.";
    }
};