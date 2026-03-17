// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

StoreApp.dom = {
    byId(id) {
        return document.getElementById(id);
    },

    value(id) {
        return document.getElementById(id)?.value?.trim() || "";
    },

    setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value ?? "";
    },

    esc(text) {
        return String(text ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    },

    escAttr(text) {
        return String(text ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    },

    money(value) {
        return Number(value || 0).toLocaleString("vi-VN") + " đ";
    },

    dateTime(value) {
        if (!value) return "";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString("vi-VN");
    }
};