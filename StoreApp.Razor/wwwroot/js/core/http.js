// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

StoreApp.http = {
    buildUrl(path) {
        const base = StoreApp.config?.apiBaseUrl;
        if (!base) throw new Error("Thiếu StoreApp.config.apiBaseUrl.");
        return base.replace(/\/$/, "") + path;
    },

    authHeaders(extra) {
        const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
        const token = StoreApp.auth.getAccessToken();
        if (token) h["Authorization"] = "Bearer " + token;
        return h;
    },

    async request(method, path, body) {
        try {
            const res = await fetch(this.buildUrl(path), {
                method,
                headers: this.authHeaders(),
                body: body === undefined ? undefined : JSON.stringify(body)
            });

            const raw = await res.text();

            let data = null;
            if (raw) {
                try { data = JSON.parse(raw); } catch { }
            }

            return { res, data, raw };
        } catch (err) {
            return { res: null, data: null, raw: String(err) };
        }
    },

    getErrorText(result) {
        if (result?.data?.errors) {
            const errors = Object.values(result.data.errors).flat().filter(Boolean);
            if (errors.length) return errors.join("\n");
        }

        return result?.data?.detail || result?.data?.message || result?.raw || "Có lỗi xảy ra.";
    }
};