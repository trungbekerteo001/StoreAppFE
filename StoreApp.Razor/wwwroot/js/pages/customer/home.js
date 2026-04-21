window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.customerHome = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const role = StoreApp.role;
    const msg = StoreApp.message;
    const pager = StoreApp.pager;

    const API = {
        product: "/api/Product",
        category: "/api/Category",
        supplier: "/api/Supplier",
        favorite: "/api/Favorite"
    };

    const CART_KEY = "customer_cart";

    const state = {
        pageNumber: 1,
        pageSize: 8,
        totalPages: 1,
        totalCount: 0,

        items: [],
        current: null,

        categories: [],
        suppliers: []
    };

    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        bindEvents();
        await loadLookups();
        await loadProducts();
    }

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

    async function loadLookups() {
        const catResult = await http.request("GET", `${API.category}?PageNumber=1&PageSize=100`);
        state.categories = (catResult?.res?.ok && Array.isArray(catResult.data)) ? catResult.data : [];

        const supResult = await http.request("GET", `${API.supplier}?PageNumber=1&PageSize=100`);
        state.suppliers = (supResult?.res?.ok && Array.isArray(supResult.data)) ? supResult.data : [];
    }

    function categoryName(id) {
        const item = state.categories.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        return item?.name || "";
    }

    function supplierName(id) {
        const item = state.suppliers.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        return item?.name || "";
    }

    async function loadProducts(clearMessage = true) {
        if (clearMessage) msg.show("cusMsg", "");

        const grid = dom.byId("productGrid");

        if (grid) {
            grid.innerHTML = `<div class="empty-box">Đang tải sản phẩm...</div>`;
        }

        const keyword = dom.value("prdKeyword");

        const qs = new URLSearchParams();
        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));

        if (keyword) {
            qs.set("Keyword", keyword);
        }

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
                            <button class="card-btn favorite" type="button" data-fav-id="${dom.escAttr(id)}">
                                ♡ Yêu thích
                            </button>

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

        grid.querySelectorAll("[data-open-id]").forEach(card => {
            card.addEventListener("click", () => openDetail(card.dataset.openId));
        });

        grid.querySelectorAll("[data-view-id]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                openDetail(btn.dataset.viewId);
            });
        });

        grid.querySelectorAll("[data-add-id]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                addToCartFromList(btn.dataset.addId);
            });
        });

        grid.querySelectorAll("[data-fav-id]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                addFavorite(btn.dataset.favId, "cusMsg");
            });
        });
    }

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

    function prevPage() {
        if (state.pageNumber <= 1) return;

        state.pageNumber--;
        loadProducts(false);
    }

    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;

        state.pageNumber++;
        loadProducts(false);
    }

    function reloadProducts() {
        state.pageNumber = 1;
        loadProducts();
    }

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

        const averageRating = Number(p.averageRating || 0);
        const reviewCount = Number(p.reviewCount || 0);

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

                    <div class="review-summary">
                        ⭐ ${averageRating > 0 ? averageRating.toFixed(1) : "Chưa có"}
                        <span>(${reviewCount} lượt đánh giá)</span>
                    </div>

                    <div class="detail-meta">
                        <div><strong>Danh mục:</strong> ${dom.esc(catName)}</div>
                        <div><strong>Nhà cung cấp:</strong> ${dom.esc(supName)}</div>
                        <div><strong>Tồn kho:</strong> ${soldOut ? "Hết hàng" : dom.esc(String(quantity))}</div>
                    </div>

                    <div class="detail-actions-extra">
                        <button class="card-btn favorite" type="button" id="btnAddFavoriteInDetail">
                            ♡ Thêm vào yêu thích
                        </button>
                    </div>
                </div>
            </div>

          
        `;

        const addBtn = dom.byId("btnAddToCart");
        if (addBtn) addBtn.disabled = soldOut;

        dom.byId("btnSendReview")?.addEventListener("click", submitReview);

        dom.byId("btnAddFavoriteInDetail")?.addEventListener("click", () => {
            addFavorite(p.id, "detailMsg");
        });

        await loadReviews(p.id);
    }

    async function loadReviews(productId) {
        const list = dom.byId("reviewList");
        if (!list) return;

        list.innerHTML = `<div class="empty-box">Đang tải đánh giá...</div>`;

        const result = await http.request("GET", `${API.product}/${productId}/reviews`);

        if (!result.res) {
            list.innerHTML = `<div class="empty-box">Không gọi được API đánh giá.</div>`;
            return;
        }

        if (!result.res.ok) {
            list.innerHTML = `<div class="empty-box">Không tải được danh sách đánh giá.</div>`;
            return;
        }

        const reviews = Array.isArray(result.data) ? result.data : [];
        renderReviews(reviews);
    }

    function renderReviews(reviews) {
        const list = dom.byId("reviewList");
        if (!list) return;

        if (!reviews.length) {
            list.innerHTML = `<div class="empty-box">Sản phẩm chưa có đánh giá nào.</div>`;
            return;
        }

        list.innerHTML = reviews.map(r => {
            const rating = Math.max(1, Math.min(5, Number(r.rating || 0)));
            const customerName = r.customerName || "Khách hàng";

            return `
                <div class="review-item">
                    <div class="review-item-head">
                        <div>
                            <strong>${"★".repeat(rating)}</strong>
                            <span class="review-customer-name">${dom.esc(customerName)}</span>
                        </div>

                        <span>${dom.esc(formatDate(r.createdAt))}</span>
                    </div>

                    <div class="review-comment">
                        ${dom.esc(r.comment || "Không có nhận xét.")}
                    </div>
                </div>
            `;
        }).join("");
    }

    async function submitReview() {
        if (!state.current?.id) return;

        const token = StoreApp.auth.getAccessToken();

        if (!token) {
            msg.show("detailMsg", "Bạn phải đăng nhập để đánh giá sản phẩm.", "warn");

            setTimeout(() => {
                window.location.href = "/Auth/Login";
            }, 1000);

            return;
        }

        const rating = Number(dom.byId("reviewRating")?.value || 5);
        const comment = dom.byId("reviewComment")?.value || "";

        const result = await http.request("POST", `${API.product}/${state.current.id}/reviews`, {
            rating,
            comment
        });

        if (!result.res) {
            msg.show("detailMsg", result.raw || "Không gọi được API đánh giá.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("detailMsg", http.getErrorText(result), "error");
            return;
        }

        const currentProductId = state.current.id;

        await openDetail(currentProductId);

        msg.show("detailMsg", "Đã gửi đánh giá sản phẩm.", "success");
    }

    async function addFavorite(productId, messageTargetId) {
        const token = StoreApp.auth.getAccessToken();

        if (!token) {
            msg.show(messageTargetId, "Bạn phải đăng nhập để thêm sản phẩm yêu thích.", "warn");

            setTimeout(() => {
                window.location.href = "/Auth/Login";
            }, 1000);

            return;
        }

        if (!productId) {
            msg.show(messageTargetId, "Không tìm thấy sản phẩm.", "error");
            return;
        }

        const result = await http.request("POST", `${API.favorite}/${productId}`);

        if (!result.res) {
            msg.show(messageTargetId, result.raw || "Không gọi được API yêu thích.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show(messageTargetId, http.getErrorText(result), "error");
            return;
        }

        msg.show(messageTargetId, "Đã thêm sản phẩm vào danh sách yêu thích.", "success");
        setTimeout(() => msg.show(messageTargetId, ""), 1800);
    }

    function closeDetailModal() {
        const modal = dom.byId("productDetailModal");
        if (modal) modal.classList.remove("show");
    }

    function readCart() {
        try {
            const raw = localStorage.getItem(CART_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    function writeCart(items) {
        localStorage.setItem(CART_KEY, JSON.stringify(items || []));
    }

    function addProductToCart(product, messageTargetId) {
        const token = StoreApp.auth.getAccessToken();

        if (!token) {
            msg.show(messageTargetId, "Bạn phải đăng nhập để mua hàng.", "warn");

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

    function addCurrentToCart() {
        addProductToCart(state.current, "detailMsg");
    }

    function addToCartFromList(id) {
        const product = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        addProductToCart(product, "cusMsg");
        setTimeout(() => msg.show("cusMsg", ""), 1800);
    }

    function money(v) {
        const n = Number(v || 0);
        return n.toLocaleString("vi-VN") + " đ";
    }

    function formatDate(value) {
        if (!value) return "";

        const d = new Date(value);

        if (Number.isNaN(d.getTime())) return "";

        return d.toLocaleString("vi-VN");
    }

    return {
        reload: reloadProducts
    };
})();