window.StoreApp = window.StoreApp || {};                // object toàn cục
window.StoreApp.pages = window.StoreApp.pages || {};    // object con để chứa logic riêng của từng page

    // IIFE - toàn bộ hàm và biến của page chỉ dùng trong phạm vi này để tránh xung đột tên
StoreApp.pages.customerHome = (() => {
    const dom = StoreApp.dom;               // chứa các phương thức thao tác DOM
    const http = StoreApp.http;             // chứa phương thức request để gọi API
    const role = StoreApp.role;             // chứa phương thức guard và decode role/token
    const msg = StoreApp.message;           // chứa phương thức show để hiển thị thông báo
    const pager = StoreApp.pager;           // chứa helper đọc metadata phân trang

    const API = {                       // chứa endpoint API dùng trong page này
        product: "/api/Product",
        category: "/api/Category",
        supplier: "/api/Supplier"
    };

    const CART_KEY = "customer_cart";

    const state = {                     // state để lưu trạng thái hiện tại của page
        pageNumber: 1,
        pageSize: 8,
        totalPages: 1,
        totalCount: 0,

        items: [],
        current: null,

        categories: [],
        suppliers: []
    };

    // khi DOM đã sẵn sàng thì gọi hàm initPage để khởi tạo page
    document.addEventListener("DOMContentLoaded", initPage);

    // hàm khởi tạo trang chủ customer: kiểm tra role, gán event, tải lookup rồi load sản phẩm

    async function initPage() {
        bindEvents();
        await loadLookups();
        await loadProducts();
    }

    // gom toàn bộ event của page sản phẩm vào một chỗ

    function bindEvents() {
        dom.byId("btnCusSearch")?.addEventListener("click", reloadProducts);
        dom.byId("btnPrev")?.addEventListener("click", prevPage);
        dom.byId("btnNext")?.addEventListener("click", nextPage);

        dom.byId("btnCusCloseDetailX")?.addEventListener("click", closeDetailModal);
        dom.byId("btnCusCloseDetail")?.addEventListener("click", closeDetailModal);
        dom.byId("cusDetailBackdrop")?.addEventListener("click", closeDetailModal);
        dom.byId("btnAddToCart")?.addEventListener("click", addCurrentToCart);

        dom.byId("prdKeyword")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                reloadProducts();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeDetailModal();
        });
    }

    // tải category và supplier để khi xem chi tiết có thể map id sang tên

    async function loadLookups() {
        const catResult = await http.request("GET", `${API.category}?PageNumber=1&PageSize=100`);
        state.categories = (catResult?.res?.ok && Array.isArray(catResult.data)) ? catResult.data : [];

        const supResult = await http.request("GET", `${API.supplier}?PageNumber=1&PageSize=100`);
        state.suppliers = (supResult?.res?.ok && Array.isArray(supResult.data)) ? supResult.data : [];
    }

    // map categoryId sang tên category từ cache

    function categoryName(id) {
        const item = state.categories.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );
        return item?.name || "";
    }

    // map supplierId sang tên supplier từ cache

    function supplierName(id) {
        const item = state.suppliers.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );
        return item?.name || "";
    }

    // load danh sách product theo keyword và phân trang

    async function loadProducts(clearMessage = true) {
        if (clearMessage) msg.show("cusMsg", "");

        const grid = dom.byId("productGrid");
        if (grid) {
            grid.innerHTML = `<div class="empty-box">Đang tải sản phẩm...</div>`;
        }

        const keyword = dom.value("prdKeyword");

        // tạo queryString để gửi filter / phân trang lên API
        const qs = new URLSearchParams();
        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));
        if (keyword) qs.set("Keyword", keyword);

        const result = await http.request("GET", `${API.product}?${qs.toString()}`);

        if (!result.res) {
            msg.show("cusMsg", result.raw || "Không gọi được API sản phẩm.", "error");
            if (grid) grid.innerHTML = `<div class="empty-box">Lỗi tải dữ liệu.</div>`;
            return;
        }

        if (!result.res.ok) {
            msg.show("cusMsg", http.getErrorText(result), "error");
            if (grid) grid.innerHTML = `<div class="empty-box">Lỗi tải dữ liệu.</div>`;
            return;
        }

        state.items = Array.isArray(result.data) ? result.data : [];

        const meta = pager.readMeta(result, state.items.length);
        state.pageNumber = Math.max(1, Number(meta.currentPage || 1));
        state.totalPages = Math.max(1, Number(meta.totalPages || 1));
        state.totalCount = Math.max(0, Number(meta.totalCount || 0));

        renderProducts();
        renderPager();
    }

    // render danh sách sản phẩm ra grid và gán event cho card / nút thao tác

    function renderProducts() {
        const grid = dom.byId("productGrid");
        if (!grid) return;

        if (!state.items.length) {
            grid.innerHTML = `<div class="empty-box">Không có sản phẩm nào.</div>`;
            return;
        }

        grid.innerHTML = state.items.map(p => {
            const id = String(p.id || "");
            const name = p.productName || "";
            const price = money(p.price);
            const img = (p.imageUrl || "").trim();
            const quantity = Number(p.quantity || 0);
            const soldOut = quantity <= 0;

            return `
                <div class="product-card" data-open-id="${dom.escAttr(id)}">
                    <div class="product-thumb-wrap">
                        ${img
                    ? `<img class="product-thumb" src="${dom.escAttr(img)}" alt="${dom.escAttr(name)}" />`
                    : `<div class="product-thumb placeholder">No image</div>`}
                    </div>

                    <div class="product-body">
                        <h3 class="product-name">${dom.esc(name)}</h3>
                        <div class="product-price">${dom.esc(price)}</div>
                        <div class="muted">${soldOut ? "Hết hàng" : `Còn ${quantity} sản phẩm`}</div>

                        <div class="card-actions">
                            <button class="card-btn secondary" type="button" data-add-id="${dom.escAttr(id)}" ${soldOut ? "disabled" : ""}>
                                Thêm vào giỏ hàng
                            </button>

                            <button class="card-btn" type="button" data-view-id="${dom.escAttr(id)}">
                                Xem chi tiết
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        // gán sự kiện click cho cả card để mở modal chi tiết
        grid.querySelectorAll("[data-open-id]").forEach(card => {
            card.addEventListener("click", () => openDetail(card.dataset.openId));
        });

        // gán sự kiện cho nút xem chi tiết riêng, đồng thời chặn nổi bọt event của card
        grid.querySelectorAll("[data-view-id]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                openDetail(btn.dataset.viewId);
            });
        });

        // gán sự kiện cho nút thêm vào giỏ ngay trên danh sách sản phẩm
        grid.querySelectorAll("[data-add-id]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                addToCartFromList(btn.dataset.addId);
            });
        });
    }

    // hiển thị trạng thái phân trang ở cuối danh sách sản phẩm
    function renderPager() {
        const pagerEl = dom.byId("pager");
        const info = dom.byId("pagerInfo");
        const prevBtn = dom.byId("btnPrev");
        const nextBtn = dom.byId("btnNext");

        if (!pagerEl || !info || !prevBtn || !nextBtn) return;

        pagerEl.style.display = "flex";
        info.textContent = `Trang ${state.pageNumber} / ${state.totalPages}`;

        prevBtn.disabled = state.pageNumber <= 1;
        nextBtn.disabled = state.pageNumber >= state.totalPages;
    }

    // lùi về trang trước

    function prevPage() {
        if (state.pageNumber <= 1) return;
        state.pageNumber--;
        loadProducts(false);
    }

    // sang trang tiếp theo

    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;
        state.pageNumber++;
        loadProducts(false);
    }

    // tải lại sản phẩm từ trang 1

    function reloadProducts() {
        state.pageNumber = 1;
        loadProducts();
    }

    // mở modal chi tiết và load thông tin chi tiết của 1 sản phẩm từ API

    async function openDetail(id) {
        const modal = dom.byId("productDetailModal");
        const body = dom.byId("productDetailBody");

        if (!modal || !body) return;

        state.current = null;
        msg.show("detailMsg", "");
        body.innerHTML = `<div class="empty-box">Đang tải chi tiết...</div>`;
        modal.classList.add("show");

        const result = await http.request("GET", `${API.product}/${id}`);
        if (!result.res) {
            body.innerHTML = `<div class="empty-box">Không gọi được API chi tiết sản phẩm.</div>`;
            return;
        }

        if (!result.res.ok) {
            body.innerHTML = `<div class="empty-box">Không tải được chi tiết sản phẩm.</div>`;
            return;
        }

        const p = result.data || {};
        state.current = p;

        const catName = categoryName(p.categoryId) || "Không rõ";
        const supName = supplierName(p.supplierId) || "Không rõ";
        const quantity = Number(p.quantity || 0);
        const soldOut = quantity <= 0;

        body.innerHTML = `
            <div class="detail-layout">
                <div class="detail-image-wrap">
                    ${p.imageUrl
                ? `<img class="detail-image" src="${dom.escAttr(p.imageUrl)}" alt="${dom.escAttr(p.productName || "")}" />`
                : `<div class="detail-image placeholder">No image</div>`}
                </div>

                <div class="detail-content">
                    <h3 class="detail-name">${dom.esc(p.productName || "")}</h3>
                    <div class="detail-price">${dom.esc(money(p.price))}</div>

                    <div class="detail-meta">
                        <div><strong>Danh mục:</strong> ${dom.esc(catName)}</div>
                        <div><strong>Nhà cung cấp:</strong> ${dom.esc(supName)}</div>
                        <div><strong>Tồn kho:</strong> ${soldOut ? "Hết hàng" : dom.esc(String(quantity))}</div>
                    </div>
                </div>
            </div>
        `;

        const addBtn = dom.byId("btnAddToCart");
        if (addBtn) addBtn.disabled = soldOut;
    }

    // đóng modal chi tiết sản phẩm

    function closeDetailModal() {
        const modal = dom.byId("productDetailModal");
        if (modal) modal.classList.remove("show");
    }

    // đọc giỏ hàng từ localStorage

    function readCart() {
        try {
            const raw = localStorage.getItem(CART_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    // ghi giỏ hàng xuống localStorage

    function writeCart(items) {
        localStorage.setItem(CART_KEY, JSON.stringify(items || []));
    }

    // thêm 1 sản phẩm vào giỏ hàng nếu còn tồn kho và chưa tồn tại trong giỏ

    function addProductToCart(product, messageTargetId) {
        // kiểm tra đã đăng nhập chưa bằng cách xem token
        const token = StoreApp.auth.getAccessToken();

        if (!token) {
            msg.show(messageTargetId, "Bạn phải đăng nhập để mua hàng.", "warn");
            // cho 1s đọc thông báo rồi đi đăng nhập 
            setTimeout(() => {
                window.location.href = "/Auth/Login";
            }, 1000);
            return;
        }

        if (!product) {
            msg.show(messageTargetId, "Không có sản phẩm để thêm.", "error");
            return;
        }

        const quantity = Number(product.quantity || 0);
        if (quantity <= 0) {
            msg.show(messageTargetId, "Sản phẩm hiện đã hết hàng.", "warn");
            return;
        }

        const cart = readCart();

        const found = cart.find(x =>
            String(x.productId).toLowerCase() === String(product.id).toLowerCase()
        );

        if (found) {
            msg.show(messageTargetId, "Sản phẩm đã có trong giỏ hàng.", "warn");
            return;
        }

        cart.push({
            productId: product.id,
            productName: product.productName,
            price: product.price,
            imageUrl: product.imageUrl || "",
            quantity: 1,
            maxQuantity: quantity
        });

        writeCart(cart);
        msg.show(messageTargetId, "Đã thêm vào giỏ hàng.", "success");
    }

    // thêm sản phẩm đang mở trong modal chi tiết vào giỏ hàng

    function addCurrentToCart() {
        addProductToCart(state.current, "detailMsg");
    }

    // thêm sản phẩm trực tiếp từ danh sách product vào giỏ hàng

    function addToCartFromList(id) {
        const product = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        addProductToCart(product, "cusMsg");
        setTimeout(() => msg.show("cusMsg", ""), 1800);
    }

    // format tiền tệ theo kiểu Việt Nam

    function money(v) {
        const n = Number(v || 0);
        return n.toLocaleString("vi-VN") + " đ";
    }

    return {
        reload: reloadProducts
    };
})();