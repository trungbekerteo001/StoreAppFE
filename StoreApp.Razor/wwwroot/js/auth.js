function apiUrl(path) {
    const base = window.APP_CONFIG?.apiBaseUrl;     // lấy base URL từ config.js
    if (!base) throw new Error("Thiếu APP_CONFIG.apiBaseUrl (config.js chưa load).");
    return base.replace(/\/$/, "") + path;
}

async function postJson(path, bodyObj) {
    const responseObj = await fetch(apiUrl(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj ?? {}) // nếu bodyObj là null hoặc undefined thì dùng {} (để tránh stringify bị lỗi)
    });

    const raw = await responseObj.text();
    let data = null;
    if (raw) {
        try { data = JSON.parse(raw); } catch { /* ignore */ }
    }

    return { responseObj, data, raw };
    // responeObj: object Response(có res.ok, res.status, res.headers…)
    // raw: nội dung trả về dạng chuỗi(dù là JSON hay text)
    // data: object JSON đã parse(nếu parse được), còn không thì null
}

function saveTokens(data) {
    if (!data) return;
    if (data.accessToken) localStorage.setItem("accessToken", data.accessToken);
    if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
}

function authLogout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    window.location.href = "/Auth/Login";
}

async function authLogin(e) {
    e.preventDefault();

    // Hiển thị trạng thái “Đang đăng nhập...” lên <div id="loginMsg">.
    showMsg("loginMsg", "Đang đăng nhập...", "warn");

    const userName = document.getElementById("userName")?.value?.trim() || "";
    const password = document.getElementById("password")?.value || "";

    // khai báo 3 biến responseObj, data, raw để nhận về từ hàm postJson
    const { responseObj, data, raw } = await postJson("/api/Auth/login", { userName, password });

    // responseObj.ok là thuộc tính có sẵn của đối tượng Response mà fetch() trả về
    if (!responseObj.ok) {   
        showMsg("loginMsg", (data?.detail || data?.message || raw || `HTTP ${responseObj.status}`), "error");
        return false;
    }

    // gọi hàm saveTokens để lưu accessToken và refreshToken vào localStorage
    saveTokens(data);

    // Đăng nhập thành công và điều hướng theo role 
    window.location.href = "/route";
    return false;
}

async function authRegister(e) {
    e.preventDefault();

    // Hiển thị trạng thái “Đang đăng ký...” lên <div id="registerMsg">.
    showMsg("registerMsg", "Đang đăng ký...", "warn");

    const userName = document.getElementById("rUserName")?.value?.trim() || "";
    const fullName = document.getElementById("rFullName")?.value?.trim() || "";
    const password = document.getElementById("rPassword")?.value || "";
    const phone = document.getElementById("rPhone")?.value?.trim() || "";

    // khai báo 3 biến responseObj, data, raw để nhận về từ hàm postJson
    const { responseObj, data, raw } = await postJson("/api/Auth/register", {
        userName, fullName, password, phone
    });

    // responseObj.ok là thuộc tính có sẵn của đối tượng Response mà fetch() trả về
    if (!responseObj.ok) {
        showMsg("registerMsg", (data?.detail || data?.message || raw || `HTTP ${responseObj.status}`), "error");
        return false;
    }

    showMsg("registerMsg", "Đăng ký thành công! Chuyển sang đăng nhập...", "success");
    setTimeout(() => window.location.href = "/Auth/Login", 500);
    return false;
}