function getAccessToken() {
    return localStorage.getItem("accessToken");
}

// Giải mã payload của JWT thành object (không verify chữ ký) 
function decodeJwtPayload(token) {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;    // JWT phải có 3 phần: header.payload.signature

        const base64Url = parts[1];    // phần payload nằm ở giữa
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");

        const json = decodeURIComponent(
            atob(base64).split("").map(c =>
                "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
            ).join("")
        );

        return JSON.parse(json);
    } catch {
        return null;
    }
}

// Lấy 1 role duy nhất từ token (string). Nếu không có -> null
function getRoleFromToken(token) {
    const payload = decodeJwtPayload(token);
    if (!payload) return null;

    // Các key role thường gặp (với ASP.NET)
    let val =
        payload.role ??
        payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];

    // Fallback: tìm key kết thúc bằng "/role"
    if (!val) {
        const k = Object.keys(payload).find(x => x.toLowerCase().endsWith("/role"));
        if (k) val = payload[k];
    }

    if (!val) return null;

    // Vì user chỉ 1 role => ưu tiên string.
    if (typeof val === "string") return val.trim() || null;

    // Phòng trường hợp BE vẫn trả array nhưng chỉ có 1 phần tử
    if (Array.isArray(val) && val.length > 0) return String(val[0]).trim() || null;

    return null;
}

// Map role -> Url
function routeForRole(role) {
    const r = String(role || "").toLowerCase();

    if (r === "admin") return "/admin";
    if (r === "staff") return "/staff";
    if (r === "customer") return "/customer";

    return "/customer";
}

function routeByRole() {
    const token = getAccessToken();
    if (!token) {
        window.location.href = "/Auth/Login";
        return;
    }

    const role = getRoleFromToken(token);
    window.location.href = routeForRole(role);
}

// Guard: chỉ cho vào trang nếu role nằm trong allowedRoles, dùng ở đầu những page cần phân quyền (ví dụ admin.html chỉ cho admin vào, thì gọi authGuard(["admin"]) ở đầu file admin.js). 
// Nếu allowedRoles là rỗng hoặc null thì sẽ cho tất cả role vào(dù có token hay không).
function authGuard(allowedRoles) {
    const token = getAccessToken();
    if (!token) {
        window.location.href = "/Auth/Login";   // nếu chưa có token thì bắt đi login
        return;
    }

    const role = String(getRoleFromToken(token) || "").toLowerCase();   // lấy role của user hiện tại 
    const allowed = (allowedRoles || []).map(r => String(r).toLowerCase());

    const ok = allowed.length === 0 || allowed.includes(role);

    if (!ok) {
        const target = routeForRole(role);

        // điều hướng UI đến trang phù hợp với role (ví dụ admin bị chặn vào staff.html thì sẽ bị đẩy về admin.html). 
        if (window.location.pathname.toLowerCase() !== target.toLowerCase()) {
            window.location.href = target;
        }
    }
}