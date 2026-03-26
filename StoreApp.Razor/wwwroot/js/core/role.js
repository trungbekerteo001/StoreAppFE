// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

// Thêm một thuộc tính tên là role vào object StoreApp
// chứa các phương thức để xử lý vai trò người dùng dựa trên token JWT
StoreApp.role = {
    // giải mã payload của token JWT để lấy thông tin vai trò
    // JWT có dạng header.payload.signature
    decodeJwtPayload(token) {
        try {
            // tách token ra làm 3 phần 
            const parts = token.split(".");
            if (parts.length !== 3) return null;    // nếu không đúng 3 phần thì không phải token hợp lệ

            const base64Url = parts[1];         // lấy phần thứ 2 tức payload 
            const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");     // chuẩn hóa base64 để có thể decode được

            // giải mã base64 thành chuỗi JSON
            const json = decodeURIComponent(
                atob(base64).split("").map(c =>
                    "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
                ).join("")
            );

            // biến chuỗi JSON thành object để dễ truy cập các thuộc tính như role
            return JSON.parse(json);
        } catch {
            return null;
        }
    },

    // lấy role từ token JWT bằng cách giải mã payload và tìm kiếm các trường có thể chứa role
    getRoleFromToken(token) {
        const payload = this.decodeJwtPayload(token);   // gọi hàm decode 
        if (!payload) return null;

        // lấy key role 
        let val =
            payload.role ??
            payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];

        // nếu không tìm đc thì kiếm các key kết thúc bằng /role 
        if (!val) {
            const k = Object.keys(payload).find(x => x.toLowerCase().endsWith("/role"));
            if (k) val = payload[k];
        }

        if (!val) return null;

        // nếu là string thì trim trả về, nếu là mảng thì lấy phần tử đầu tiên 
        if (typeof val === "string") return val.trim() || null;
        if (Array.isArray(val) && val.length > 0) return String(val[0]).trim() || null;

        return null;
    },

    // lấy user id từ token JWT bằng cách giải mã payload và tìm kiếm các trường có thể chứa user id
    getUserIdFromToken(token) {
        const payload = this.decodeJwtPayload(token);
        if (!payload) return null;

        return (
            payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ||
            payload.nameid ||
            payload.sub ||
            null
        );
    },

    // lấy thời gian hết hạn (exp) từ token JWT bằng cách giải mã payload và tìm kiếm trường exp
    getExpFromToken(token) {
        const payload = this.decodeJwtPayload(token);
        if (!payload) return null;

        const exp = Number(payload.exp);
        return Number.isFinite(exp) ? exp : null;
    },

    // kiểm tra xem token đã hết hạn chưa bằng cách so sánh thời gian hiện tại với thời gian exp trong token
    isTokenExpired(token, sSeconds = 30) {
        const exp = this.getExpFromToken(token);
        if (!exp) return true;

        const now = Math.floor(Date.now() / 1000);  // Date.now trả về milisecond nên phải chia 1000 để được giây

        // nếu token sẽ hết hạn trong vòng sSeconds giây nữa
        // thì coi như đã hết hạn
        return exp <= now + sSeconds;
    },

    // map role sang page tương ứng 
    routeForRole(role) {
        const r = String(role || "").toLowerCase();

        if (r === "admin") return "/admin";
        if (r === "staff") return "/staff";
        if (r === "customer") return "/customer";

        return "/Auth/Login";   // nếu không có role hợp lệ thì chuyển về login để đăng nhập lại
    },

    // tự động chuyển trang theo role hiện tại, nếu không có token hoặc role không hợp lệ thì chuyển về login
    redirectByRole() {
        const token = StoreApp.auth.getAccessToken();       // lấy token từ localStorage

        if (!token) {                                       // nếu không có token thì chuyển về login để đăng nhập
            window.location.href = "/Auth/Login";
            return;
        }

        const role = this.getRoleFromToken(token);          // lấy role từ token
        window.location.href = this.routeForRole(role);     // gọi hàm routeForRole để lấy page
    },

    // chặn user vào trang không đúng quyền 
    guard(allowedRoles) {
        const token = StoreApp.auth.getAccessToken();       // lấy token từ localStorage

        if (!token) {                                       // nếu không có token thì chuyển về login để đăng nhập
            window.location.href = "/Auth/Login";
            return false;
        }

        const role = String(this.getRoleFromToken(token) || "").toLowerCase();      // lấy role hiện tại 
        const allowed = (allowedRoles || []).map(r => String(r).toLowerCase());     

        // nếu allowedRoles rỗng thì cho qua, hoặc role nằm trong allowed cũng cho qua
        const ok = allowed.length === 0 || allowed.includes(role);

        if (!ok) {  // nếu role không được allowed 
            const target = this.routeForRole(role); // gọi lại hàm để chuyển trang cho đúng role 

            if (window.location.pathname.toLowerCase() !== target.toLowerCase()) {
                window.location.href = target;      // tạm biệt 
            }

            return false;
        }

        return true;
    }
};