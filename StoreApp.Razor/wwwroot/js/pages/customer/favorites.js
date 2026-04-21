window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.customerFavorites = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const msg = StoreApp.message;
    const pager = StoreApp.pager;

    const API = {
        favorite: "/api/Favorite"
    };

    const state = {
        pageNumber: 1,
        pageSize: 8,
        totalPages: 1,
        totalCount: 0,
        items: []
    };

    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        const token = StoreApp.auth.getAccessToken();

        if (!token) {
            msg.show("favMsg", "Bạn phải đăng nhập để xem danh sách yêu thích.", "warn");
            setTimeout(() => {
                window.location.href = "/Auth/Login";
            }, 1000);
            return;
        }

        bindEvents();
        await loadFavorites();
    }

    function bindEvents() {
        dom.byId("btnFavPrev")?.addEventListener("click", prevPage);
        dom.byId("btnFavNext")?.addEventListener("click", nextPage);
    }

    async function loadFavorites(clearMessage = true) {
        if (clearMessage) msg.show("favMsg", "");

        const grid = dom.byId("favoriteGrid");

        if (grid) {
            grid.innerHTML = `<div class="empty-box">Đang tải sản phẩm yêu thích...</div>`;
        }

        const qs = new URLSearchParams();
        qs.set("pageNumber", String(state.pageNumber));
        qs.set("pageSize", String(state.pageSize));

        const result = await http.request("GET", `${API.favorite}?${qs.toString()}`);

        if (!result.res) {
            msg.show("favMsg", result.raw || "Không gọi được API Favorite.", "error");
            if (grid) grid.innerHTML = `<div class="empty-box">Lỗi tải dữ liệu.</div>`;
            return;
        }

        if (!result.res.ok) {
            msg.show("favMsg", http.getErrorText(result), "error");
            if (grid) grid.innerHTML = `<div class="empty-box">Lỗi tải dữ liệu.</div>`;
            return;
        }

        state.items = Array.isArray(result.data) ? result.data : [];

        const meta = pager.readMeta(result, state.items.length);
        state.pageNumber = Math.max(1, Number(meta.currentPage || 1));
        state.totalPages = Math.max(1, Number(meta.totalPages || 1));
        state.totalCount = Math.max(0, Number(meta.totalCount || 0));

        renderFavorites();
        renderPager();
    }

    function renderFavorites() {
        const grid = dom.byId("favoriteGrid");
        if (!grid) return;

        if (!state.items.length) {
            grid.innerHTML = `<div class="empty-box">Bạn chưa có sản phẩm yêu thích nào.</div>`;
            return;
        }

        grid.innerHTML = state.items.map(p => {
            const productId = String(p.productId || "");
            const name = p.productName || "";
            const img = (p.imageUrl || "").trim();
            const quantity = Number(p.quantity || 0);
            const soldOut = quantity <= 0;

            return `
                <div class="product-card">
                    <div class="product-thumb-wrap">
                        ${img
                    ? `<img class="product-thumb" src="${dom.escAttr(img)}" alt="${dom.escAttr(name)}" />`
                    : `<div class="product-thumb placeholder">No image</div>`}
                    </div>

                    <div class="product-body">
                        <h3 class="product-name">${dom.esc(name)}</h3>
                        <div class="product-price">${dom.esc(money(p.price))}</div>
                        <div class="muted">${soldOut ? "Hết hàng" : `Còn ${quantity} sản phẩm`}</div>

                        <div class="card-actions">
                            <button class="card-btn danger" type="button" data-remove-id="${dom.escAttr(productId)}">
                                Bỏ yêu thích
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        grid.querySelectorAll("[data-remove-id]").forEach(btn => {
            btn.addEventListener("click", () => removeFavorite(btn.dataset.removeId));
        });
    }

    function renderPager() {
        const pagerEl = dom.byId("favPager");
        const info = dom.byId("favPagerInfo");
        const prevBtn = dom.byId("btnFavPrev");
        const nextBtn = dom.byId("btnFavNext");

        if (!pagerEl || !info || !prevBtn || !nextBtn) return;

        pagerEl.style.display = "flex";
        info.textContent = `Trang ${state.pageNumber} / ${state.totalPages}`;

        prevBtn.disabled = state.pageNumber <= 1;
        nextBtn.disabled = state.pageNumber >= state.totalPages;
    }

    async function removeFavorite(productId) {
        if (!productId) return;

        if (!confirm("Bỏ sản phẩm này khỏi danh sách yêu thích?")) return;

        const result = await http.request("DELETE", `${API.favorite}/${productId}`);

        if (!result.res) {
            msg.show("favMsg", result.raw || "Không gọi được API xóa yêu thích.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("favMsg", http.getErrorText(result), "error");
            return;
        }

        msg.show("favMsg", "Đã bỏ sản phẩm khỏi danh sách yêu thích.", "success");
        await loadFavorites(false);
    }

    function prevPage() {
        if (state.pageNumber <= 1) return;
        state.pageNumber--;
        loadFavorites(false);
    }

    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;
        state.pageNumber++;
        loadFavorites(false);
    }

    function money(v) {
        const n = Number(v || 0);
        return n.toLocaleString("vi-VN") + " đ";
    }

    return {
        reload: loadFavorites
    };
})();