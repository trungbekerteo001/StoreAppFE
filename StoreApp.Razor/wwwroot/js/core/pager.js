// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

// thêm thuộc tính pager vào StoreApp
// chứa phương thức readMeta để đọc thông tin phân trang từ header response
StoreApp.pager = {
    readMeta(result, fallbackCount = 0) {
        const raw = result?.res?.headers?.get("X-Pagination");  // lấy header X-Pagination từ response

        // biến raw là chuỗi JSON giỗng vầy {"CurrentPage":1,"TotalPages":5,"TotalCount":42}
        if (!raw) {     // nếu không có header thì khởi tạo thông tin phân trang 
            return { currentPage: 1, totalPages: 1, totalCount: fallbackCount };
        }

        try {
            const meta = JSON.parse(raw);   // chuyển chuỗi JSON trong header thành object 
            return {
                currentPage: Number(meta.CurrentPage || 1),
                totalPages: Number(meta.TotalPages || 1),
                totalCount: Number(meta.TotalCount || fallbackCount)
            };
        } catch {   // nếu có lỗi khi parse JSON thì trả về thông tin phân trang mặc định
            return { currentPage: 1, totalPages: 1, totalCount: fallbackCount };
        }
    }
};