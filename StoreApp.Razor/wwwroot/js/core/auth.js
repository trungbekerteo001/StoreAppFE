// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

// gán thuộc tính auth vào StoreApp, chứa các phương thức liên quan đến xác thực
// như login, register, logout, lưu token, xóa token, gửi request có token, v.v.
StoreApp.auth = {
    // biến này dùng để lưu promise khi đang thực hiện refresh token, để tránh gọi nhiều request refresh token cùng lúc
    _refreshPromise: null,

    getAccessToken() {
        return localStorage.getItem("accessToken");
    },

    getRefreshToken() {
        return localStorage.getItem("refreshToken");
    },

    // lưu accessToken và refreshToken của data trả về vào localStorage
    saveTokens(data) {
        if (!data) return;
        if (data.accessToken) localStorage.setItem("accessToken", data.accessToken);
        if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    },

    // xóa accessToken và refreshToken trong localStorage <=> đăng xuất
    clearTokens() {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
    },

    // gọi API refresh token để lấy access token mới khi access token cũ đã hết hạn
    async ensureAccessToken() {
        const accessToken = this.getAccessToken();
        if (!accessToken) return null;

        // nếu access token chưa hết hạn (có thể dùng được ít nhất 30s nữa) thì trả về token cũ, không cần refresh
        if (!StoreApp.role.isTokenExpired(accessToken, 30)) {
            return accessToken;
        }

        const ok = await this.refreshAccessToken();
        if (!ok) return null;

        return this.getAccessToken();
    },

    // gọi API refresh token để lấy access token mới, nếu thành công thì lưu token mới vào localStorage và trả về true, ngược lại trả về false
    async restoreSessionIfNeeded() {
        const accessToken = this.getAccessToken();
        if (!accessToken) return false;

        const token = await this.ensureAccessToken();
        if (token) {
            return true;
        }
        return false;
    },

    // hàm này sẽ được gọi khi access token đã hết hạn, nó sẽ gửi request refresh token để lấy access token mới
    // nếu có request refresh token nào đang chờ thì sẽ đợi kết quả của request đó thay vì gửi thêm request mới
    async refreshAccessToken() {
        // nếu đã có request refresh token đang chờ thì đợi kết quả của request đó
        if (this._refreshPromise) {
            return this._refreshPromise;
        }

        // nếu chưa có request refresh token nào đang chờ thì tạo mới một request refresh token và lưu vào _refreshPromise
        this._refreshPromise = (async () => {
            try {
                const accessToken = this.getAccessToken();
                const refreshToken = this.getRefreshToken();
                const userId = StoreApp.role.getUserIdFromToken(accessToken);

                // nếu thiếu accessToken, refreshToken hoặc userId thì coi như không thể refresh token được, xóa token và yêu cầu đăng nhập lại
                if (!accessToken || !refreshToken || !userId) {
                    this.clearTokens();
                    return false;
                }

                const { responseObj, data } = await this.postJson("/api/Auth/refresh-token", {
                    userId,
                    refreshToken
                });

                // nếu API trả về lỗi hoặc không có accessToken mới thì coi như refresh token cũng không hợp lệ nữa, xóa token và yêu cầu đăng nhập lại
                if (!responseObj?.ok || !data?.accessToken || !data?.refreshToken) {
                    this.clearTokens();
                    return false;
                }

                this.saveTokens(data);
                return true;
            } catch {
                // nếu có lỗi trong quá trình gọi API thì coi như refresh token không hợp lệ, xóa token và yêu cầu đăng nhập lại
                this.clearTokens();
                return false;
            } finally {
                // sau khi hoàn thành request refresh token, dù thành công hay thất bại thì đều xóa _refreshPromise để cho phép các request tiếp theo có thể gọi refresh token nếu cần
                this._refreshPromise = null;
            }
        })();

        return this._refreshPromise;
    },

    // hàm quan trọng nhất của file
    // gửi các request POST dạng JSON tới API auth.
    async postJson(path, bodyObj) {   
        // gọi API 
        const responseObj = await fetch(StoreApp.http.buildUrl(path), {     // ghép từ base URL 
            method: "POST",                         
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyObj ?? {})
        });

        const raw = await responseObj.text();   // đọc response dạng chuỗi 

        let data = null;
        // prase JSON
        if (raw) {
            try { data = JSON.parse(raw); } catch { }
        }

        // cuối dùng nhận về:
        // responseObj: response gốc, có status, ok, ...
        // data: object JSON nếu parse được
        // raw: text gốc
        return { responseObj, data, raw };
    },

    // đăng xuất: gọi API logout để xóa refresh token ở server, sau đó xóa token ở client và chuyển về trang login
    async logout() {
        try {
            const accessToken = this.getAccessToken();
            const refreshToken = this.getRefreshToken();
            const userId = StoreApp.role.getUserIdFromToken(accessToken);

            if (userId && refreshToken) {
                await this.postJson("/api/Auth/logout", { userId, refreshToken });
            }
        } catch {
        }

        this.clearTokens();
        window.location.href = "/Auth/Login";
    },

    async login(e) {
        // sau khi submit form thì ngăn hành động tự tải lại trang 
        e.preventDefault();     

        StoreApp.message.show("loginMsg", "Đang đăng nhập...", "warn");

        const userName = document.getElementById("userName")?.value?.trim() || "";
        const password = document.getElementById("password")?.value || "";

        // Gửi request đăng nhập cho BE
        const { responseObj, data, raw } = await this.postJson("/api/Auth/login", { userName, password });

        if (!responseObj.ok) {      // API 400, 500...
            StoreApp.message.show(
                "loginMsg",
                StoreApp.http.getErrorText({ data, raw }) || `HTTP ${responseObj.status}`,
                "error"
            );
            return false;
        }

        this.saveTokens(data);
        window.location.href = "/route";    // đến page route để hiện page theo role
        return false;
    },

    async register(e) {
        // sau khi submit form thì ngăn hành động tự tải lại trang 
        e.preventDefault();

        StoreApp.message.show("registerMsg", "Đang đăng ký...", "warn");

        // lấy data từ các trường dữ liệu FE
        const userName = document.getElementById("rUserName")?.value?.trim() || "";
        const fullName = document.getElementById("rFullName")?.value?.trim() || "";
        const password = document.getElementById("rPassword")?.value || "";
        const phone = document.getElementById("rPhone")?.value?.trim() || "";

        // Gửi request đăng ký cho BE
        const { responseObj, data, raw } = await this.postJson("/api/Auth/register", {
            userName, fullName, password, phone
        });

        // sai thông báo lỗi 
        if (!responseObj.ok) {      // API 400, 500...
            StoreApp.message.show(
                "registerMsg",
                StoreApp.http.getErrorText({ data, raw }) || `HTTP ${responseObj.status}`,
                "error"
            );
            return false;
        }

        // lưu username của ng đang xác thực 
        sessionStorage.setItem("pendingRegisterUserName", userName);

        // hiện form nhập OTP
        document.getElementById("otpBox").style.display = "block";

        // ngăn không cho người dùng sửa thông tin khi nhập otp 
        document.getElementById("rUserName").disabled = true;
        document.getElementById("rFullName").disabled = true;
        document.getElementById("rPassword").disabled = true;
        document.getElementById("rPhone").disabled = true;

        StoreApp.message.show("registerMsg", "Đăng ký bước 1 thành công. Vui lòng nhập OTP đã gửi về email.", "success");
        return false;
    },

    async verifyOtp() {
        StoreApp.message.show("otpMsg", "Đang xác thực OTP...", "warn");

        // lấy email từ sessionStorage (nếu có) hoặc từ trường rUserName (vì lý do nào đó sessionStorage rỗng)
        const email = sessionStorage.getItem("pendingRegisterUserName")
            || document.getElementById("rUserName")?.value?.trim()
            || "";

        // lấy otp từ trường otpCode sau khi nhập
        const otp = document.getElementById("otpCode")?.value?.trim() || "";


        if (!email) {
            StoreApp.message.show("otpMsg", "Không tìm thấy email đăng ký.", "error");
            return;
        }

        if (!otp) {
            StoreApp.message.show("otpMsg", "Vui lòng nhập mã OTP.", "error");
            return;
        }

        // gọi API xác thực OTP
        const { responseObj, data, raw } = await this.postJson("/api/Auth/verify-otp", { email, otp });

        if (!responseObj.ok) {
            StoreApp.message.show(
                "otpMsg",
                StoreApp.http.getErrorText({ data, raw }) || `HTTP ${responseObj.status}`,
                "error"
            );
            return;
        }

        // xác thực thành công thì giải phóng sessionStorage
        sessionStorage.removeItem("pendingRegisterUserName");
        StoreApp.message.show("otpMsg", "Xác thực OTP thành công. Đang chuyển sang đăng nhập...", "success");

        // time out 0.8s rồi chuyển về trang login để đăng nhập với tài khoản vừa tạo
        setTimeout(() => {
            window.location.href = "/Auth/Login";
        }, 800);
    },

    // gửi lại OTP sau 60s 
    async resendOtp() {
        StoreApp.message.show("otpMsg", "Đang gửi lại OTP...", "warn");

        // lấy email từ sessionStorage (nếu có) hoặc từ trường rUserName (vì lý do nào đó sessionStorage rỗng)
        const userName = sessionStorage.getItem("pendingRegisterUserName")
            || document.getElementById("rUserName")?.value?.trim()
            || "";

        if (!userName) {
            StoreApp.message.show("otpMsg", "Không tìm thấy email để gửi lại OTP.", "error");
            return;
        }

        // gọi API gửi lại OTP
        const { responseObj, data, raw } = await this.postJson("/api/Auth/resend-otp", { userName });

        if (!responseObj.ok) {
            StoreApp.message.show(
                "otpMsg",
                StoreApp.http.getErrorText({ data, raw }) || `HTTP ${responseObj.status}`,
                "error"
            );
            return;
        }

        // oke em 
        StoreApp.message.show("otpMsg", "Đã gửi lại OTP.", "success");
    }
};