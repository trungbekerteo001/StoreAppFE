// Nếu window.StoreApp đã tồn tại thì giữ nguyên
// Nếu chưa tồn tại thì tạo mới thành { } (object rỗng)
// StoreApp là 1 biến object toàn cục được gán lên window, có thể chứa nhiều thuộc tính và phương thức khác nhau
window.StoreApp = window.StoreApp || {};

StoreApp.pager = {
    readMeta(result, fallbackCount = 0) {
        const raw = result?.res?.headers?.get("X-Pagination");

        if (!raw) {
            return { currentPage: 1, totalPages: 1, totalCount: fallbackCount };
        }

        try {
            const meta = JSON.parse(raw);
            return {
                currentPage: Number(meta.CurrentPage || 1),
                totalPages: Number(meta.TotalPages || 1),
                totalCount: Number(meta.TotalCount || fallbackCount)
            };
        } catch {
            return { currentPage: 1, totalPages: 1, totalCount: fallbackCount };
        }
    }
};