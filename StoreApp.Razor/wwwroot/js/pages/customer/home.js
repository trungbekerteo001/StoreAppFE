window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.customerHome = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const msg = StoreApp.message;
    const pager = StoreApp.pager;

    const API = {
        product: "/api/Product",
        category: "/api/Category",
        supplier: "/api/Supplier",
        cart: "/api/Cart"
    };

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
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await addToCartFromList(btn.dataset.addId);
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

    function closeDetailModal() {
        const modal = dom.byId("productDetailModal");
        if (modal) modal.classList.remove("show");
    }

    async function addProductToCart(product, messageTargetId) {
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

        const result = await http.request("POST", `${API.cart}/items`, {
            productId: product.id,
            quantity: 1
        });

        if (!result.res) {
            msg.show(messageTargetId, result.raw || "Không gọi được API thêm giỏ hàng.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show(messageTargetId, http.getErrorText(result), "error");
            return;
        }

        msg.show(messageTargetId, "Đã thêm vào giỏ hàng.", "success");
    }

    async function addCurrentToCart() {
        await addProductToCart(state.current, "detailMsg");
    }

    async function addToCartFromList(id) {
        const product = state.items.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );

        await addProductToCart(product, "cusMsg");
        setTimeout(() => msg.show("cusMsg", ""), 1800);
    }

    function money(v) {
        const n = Number(v || 0);
        return n.toLocaleString("vi-VN") + " đ";
    }

    return {
        reload: reloadProducts
    };
})();