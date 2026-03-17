// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

StoreApp.role = {
    decodeJwtPayload(token) {
        try {
            const parts = token.split(".");
            if (parts.length !== 3) return null;

            const base64Url = parts[1];
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
    },

    getRoleFromToken(token) {
        const payload = this.decodeJwtPayload(token);
        if (!payload) return null;

        let val =
            payload.role ??
            payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];

        if (!val) {
            const k = Object.keys(payload).find(x => x.toLowerCase().endsWith("/role"));
            if (k) val = payload[k];
        }

        if (!val) return null;

        if (typeof val === "string") return val.trim() || null;
        if (Array.isArray(val) && val.length > 0) return String(val[0]).trim() || null;

        return null;
    },

    routeForRole(role) {
        const r = String(role || "").toLowerCase();

        if (r === "admin") return "/admin";
        if (r === "staff") return "/staff";
        if (r === "customer") return "/customer";

        return "/Auth/Login";
    },

    redirectByRole() {
        const token = StoreApp.auth.getAccessToken();

        if (!token) {
            window.location.href = "/Auth/Login";
            return;
        }

        const role = this.getRoleFromToken(token);
        window.location.href = this.routeForRole(role);
    },

    guard(allowedRoles) {
        const token = StoreApp.auth.getAccessToken();

        if (!token) {
            window.location.href = "/Auth/Login";
            return false;
        }

        const role = String(this.getRoleFromToken(token) || "").toLowerCase();
        const allowed = (allowedRoles || []).map(r => String(r).toLowerCase());

        const ok = allowed.length === 0 || allowed.includes(role);

        if (!ok) {
            const target = this.routeForRole(role);

            if (window.location.pathname.toLowerCase() !== target.toLowerCase()) {
                window.location.href = target;
            }

            return false;
        }

        return true;
    }
};