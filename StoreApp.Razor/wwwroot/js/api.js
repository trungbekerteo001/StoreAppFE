// helper tạo header có token (Authorization) cho JWT nếu có 
function authHeaders(extra) {
    const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
    const token = (typeof getAccessToken === "function") ? getAccessToken() : null;
    if (token) h["Authorization"] = "Bearer " + token;
    return h;
}

async function apiRequest(method, path, body) {
    // method: "GET" | "POST" | "PUT" | "DELETE"…
    // path: đường dẫn endpoint(vd "/api/Category" hoặc "/api/Category/5") 
    // body: dữ liệu gửi lên(object).Với GET / DELETE thường là undefined.
    try {
        const res = await fetch(apiUrl(path), {  // ghép path với apiUrl trong auth.js để thành URL đầy đủ
            method,    
            headers: authHeaders(),     // gọi hàm authHeaders phía trên để lấy header có token nếu có
            body: body === undefined ? undefined : JSON.stringify(body) // nếu không có body thì đang là luồng GET/DELETE 
        });

        const raw = await res.text();
        let data = null;
        if (raw) { try { data = JSON.parse(raw); } catch { } }

        return { res, data, raw };
        // res: object Response(có res.ok, res.status, res.headers…)
        // raw: nội dung trả về dạng chuỗi(dù là JSON hay text)
        // data: object JSON đã parse(nếu parse được), còn không thì null
    } catch (err) {
        return { res: null, data: null, raw: String(err) };   // nếu có lỗi (như mạng), trả về res là null, data là null, raw là chuỗi lỗi
    }
}

// lấy response của hàm apiRequest để hiển thị lỗi 
function getApiErrorText(result) {  
    if (result && result.data && result.data.errors) {      
        const errors = Object.values(result.data.errors)    // lấy value của các lỗi từ validation 
                            .flat()                         // nếu có nhiều lỗi trong 1 field thì gộp vào 1 mảng chung
                            .filter(Boolean);               // Xóa các phần tử rỗng, null, undefined, '', false trong mảng
        if (errors.length) return errors.join('\n');    
    }

    // không có lỗi validation, nhưng API trả về lỗi với message hoặc detail
    return result?.data?.detail || result?.data?.message || 'Có lỗi xảy ra.';
}