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
    authHeaders(extra) {
        // tạo header mặc định có "Content-Type": "application/json" để gửi dữ liệu dạng JSON
        // nếu có extra truyền vào, ví dụ { "X-Custom-Header": "value" }
        const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
        // lấy access token từ localStorage và thêm vào header dưới dạng "Authorization
        const token = StoreApp.auth.getAccessToken();
        if (token) h["Authorization"] = "Bearer " + token;  // giúp các API cần đăng nhập tự nhận biết user hiện tại
        return h;
    },

    // gửi request tới API với method, path và body tùy ý
    async request(method, path, body) {
        // method: GET, POST, PUT, DELETE
        // path: đường dẫn API, ví dụ "/api/Product"
        // body: dữ liệu gửi đi
        try {
            // gọi API, method, header có token nếu có, body dạng JSON nếu có
            const res = await fetch(this.buildUrl(path), {
                method,
                headers: this.authHeaders(),    // tự gán Content-Type
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