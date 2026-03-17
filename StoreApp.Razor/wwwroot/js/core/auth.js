// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

StoreApp.auth = {
    getAccessToken() {
        return localStorage.getItem("accessToken");
    },

    getRefreshToken() {
        return localStorage.getItem("refreshToken");
    },

    saveTokens(data) {
        if (!data) return;
        if (data.accessToken) localStorage.setItem("accessToken", data.accessToken);
        if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    },

    clearTokens() {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
    },

    async postJson(path, bodyObj) {
        const responseObj = await fetch(StoreApp.http.buildUrl(path), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyObj ?? {})
        });

        const raw = await responseObj.text();

        let data = null;
        if (raw) {
            try { data = JSON.parse(raw); } catch { }
        }

        return { responseObj, data, raw };
    },

    logout() {
        this.clearTokens();
        window.location.href = "/Auth/Login";
    },

    async login(e) {
        e.preventDefault();

        StoreApp.message.show("loginMsg", "Đang đăng nhập...", "warn");

        const userName = document.getElementById("userName")?.value?.trim() || "";
        const password = document.getElementById("password")?.value || "";

        const { responseObj, data, raw } = await this.postJson("/api/Auth/login", { userName, password });

        if (!responseObj.ok) {
            StoreApp.message.show(
                "loginMsg",
                data?.detail || data?.message || raw || `HTTP ${responseObj.status}`,
                "error"
            );
            return false;
        }

        this.saveTokens(data);
        window.location.href = "/route";
        return false;
    },

    async register(e) {
        e.preventDefault();

        StoreApp.message.show("registerMsg", "Đang đăng ký...", "warn");

        const userName = document.getElementById("rUserName")?.value?.trim() || "";
        const fullName = document.getElementById("rFullName")?.value?.trim() || "";
        const password = document.getElementById("rPassword")?.value || "";
        const phone = document.getElementById("rPhone")?.value?.trim() || "";

        const { responseObj, data, raw } = await this.postJson("/api/Auth/register", {
            userName, fullName, password, phone
        });

        if (!responseObj.ok) {
            StoreApp.message.show(
                "registerMsg",
                data?.detail || data?.message || raw || `HTTP ${responseObj.status}`,
                "error"
            );
            return false;
        }

        sessionStorage.setItem("pendingRegisterUserName", userName);

        document.getElementById("otpBox").style.display = "block";
        document.getElementById("rUserName").disabled = true;
        document.getElementById("rFullName").disabled = true;
        document.getElementById("rPassword").disabled = true;
        document.getElementById("rPhone").disabled = true;

        StoreApp.message.show("registerMsg", "Đăng ký bước 1 thành công. Vui lòng nhập OTP đã gửi về email.", "success");
        return false;
    },

    async verifyOtp() {
        StoreApp.message.show("otpMsg", "Đang xác thực OTP...", "warn");

        const email = sessionStorage.getItem("pendingRegisterUserName")
            || document.getElementById("rUserName")?.value?.trim()
            || "";

        const otp = document.getElementById("otpCode")?.value?.trim() || "";

        if (!email) {
            StoreApp.message.show("otpMsg", "Không tìm thấy email đăng ký.", "error");
            return;
        }

        if (!otp) {
            StoreApp.message.show("otpMsg", "Vui lòng nhập mã OTP.", "error");
            return;
        }

        const { responseObj, data, raw } = await this.postJson("/api/Auth/verify-otp", { email, otp });

        if (!responseObj.ok) {
            StoreApp.message.show(
                "otpMsg",
                data?.detail || data?.message || raw || `HTTP ${responseObj.status}`,
                "error"
            );
            return;
        }

        sessionStorage.removeItem("pendingRegisterUserName");
        StoreApp.message.show("otpMsg", "Xác thực OTP thành công. Đang chuyển sang đăng nhập...", "success");

        setTimeout(() => {
            window.location.href = "/Auth/Login";
        }, 800);
    },

    async resendOtp() {
        StoreApp.message.show("otpMsg", "Đang gửi lại OTP...", "warn");

        const userName = sessionStorage.getItem("pendingRegisterUserName")
            || document.getElementById("rUserName")?.value?.trim()
            || "";

        if (!userName) {
            StoreApp.message.show("otpMsg", "Không tìm thấy email để gửi lại OTP.", "error");
            return;
        }

        const { responseObj, data, raw } = await this.postJson("/api/Auth/resend-otp", { userName });

        if (!responseObj.ok) {
            StoreApp.message.show(
                "otpMsg",
                data?.detail || data?.message || raw || `HTTP ${responseObj.status}`,
                "error"
            );
            return;
        }

        StoreApp.message.show("otpMsg", "Đã gửi lại OTP.", "success");
    }
};