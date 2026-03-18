// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

// thêm thuộc tính message vào StoreApp, chứa phương thức show để hiển thị thông báo
StoreApp.message = {
    // truyền id của element muốn hiện thông báo, text là nội dung, type là kiểu thông báo (vd "error", "warn", "success") để thêm CSS tương ứng
    show(id, text, type) {
        const el = document.getElementById(id);
        if (!el) return;

        const msg = (text ?? "").toString();

        if (!msg.trim()) {      // nếu msg rỗng hoặc chỉ chứa khoảng trắng thì ẩn element và xóa nội dung
            el.style.display = "none";
            el.textContent = "";
            el.className = "msg";
            return;
        }

        el.style.display = "block";     // ngược lại thì hiện element và gán class "msg" cộng với class tương ứng với type 

        const t = (type ?? "").toString().trim();
        el.className = "msg" + (t ? ` ${t}` : "");
        el.textContent = msg;
    }
};