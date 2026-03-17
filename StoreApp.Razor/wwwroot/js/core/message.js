// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

StoreApp.message = {
    show(id, text, type) {
        const el = document.getElementById(id);
        if (!el) return;

        const msg = (text ?? "").toString();

        if (!msg.trim()) {
            el.style.display = "none";
            el.textContent = "";
            el.className = "msg";
            return;
        }

        el.style.display = "block";

        const t = (type ?? "").toString().trim();
        el.className = "msg" + (t ? ` ${t}` : "");
        el.textContent = msg;
    }
};