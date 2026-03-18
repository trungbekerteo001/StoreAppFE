// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

// Thêm một thuộc tính tên là config vào object StoreApp
// tất cả API đều ghép từ baseURL này 
StoreApp.config = {
    apiBaseUrl: "https://localhost:7217"
};