// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

// thêm thuộc tính dom vào StoreApp, chứa các phương thức để thao tác DOM
StoreApp.dom = {
    // get element theo id 
    byId(id) {
        return document.getElementById(id);
    },

    // get value của element theo id, nếu không tồn tại thì trả về chuỗi rỗng
    value(id) {
        return document.getElementById(id)?.value?.trim() || "";
    },

    // setText cho element theo id, text là value truyền vào 
    setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value ?? "";   // nếu value là null hoặc undefined thì set thành chuỗi rỗng
    },

    // để hiển thị "Mẹ bầu & em bé <3" mà không lỗi
    esc(text) {
        return String(text ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    },

    // để dùng class CSS không lỗi khi dùng biến css
    // vd const name = `abc" onclick="alert(1)`;
    // truyền name vào `<button data-name="${name}">Xem</button>` lỗi ngay do dấu "" trong name 
    escAttr(text) {
        return String(text ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    },

    // format money 
    money(value) {
        return Number(value || 0).toLocaleString("vi-VN") + " đ";
    },

    // format date time
    dateTime(value) {
        if (!value) return "";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString("vi-VN");
    }
};