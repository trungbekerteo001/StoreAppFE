window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.customerCart = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const role = StoreApp.role;
    const msg = StoreApp.message;

    const API = {
        product: "/api/Product",
        order: "/api/Order",
        address: "/api/CustomerAddress"
    };

    const CART_KEY = "customer_cart";

    const state = {
        items: [],
        addresses: []
    };

    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        if (!role.guard(["Customer"])) return;

        bindEvents();
        await loadAddresses();
        await loadCart();
    }

    function bindEvents() {
        dom.byId("btnCartClear")?.addEventListener("click", clearCart);
        dom.byId("btnCreateOrder")?.addEventListener("click", createOrder);

        document.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-cart-action]");
            if (!btn) return;

            const action = btn.dataset.cartAction;
            const productId = btn.dataset.productId || "";

            if (action === "increase") increase(productId);
            if (action === "decrease") decrease(productId);
            if (action === "remove") removeItem(productId);
        });
    }

    async function loadAddresses() {
        const select = dom.byId("orderAddressId");
        if (select) select.innerHTML = `<option value="">Đang tải địa chỉ...</option>`;

        const result = await http.request("GET", API.address);

        if (!result.res || !result.res.ok) {
            state.addresses = [];
            if (select) select.innerHTML = `<option value="">Không tải được địa chỉ</option>`;
            return;
        }

        state.addresses = Array.isArray(result.data) ? result.data : [];
        renderAddressSelect();
    }

    function renderAddressSelect() {
        const select = dom.byId("orderAddressId");
        if (!select) return;

        if (!state.addresses.length) {
            select.innerHTML = `<option value="">Bạn chưa có địa chỉ giao hàng</option>`;
            return;
        }

        select.innerHTML = `
            <option value="">-- Chọn địa chỉ giao hàng --</option>
            ${state.addresses.map(x => `
                <option value="${dom.escAttr(x.id)}" ${x.isDefault ? "selected" : ""}>
                    ${dom.esc(x.receiverName || "")} - ${dom.esc(x.phone || "")} - ${dom.esc(x.addressLine || "")}${x.isDefault ? " (Mặc định)" : ""}
                </option>
            `).join("")}
        `;
    }

    function readCartLocal() {
        try {
            const raw = localStorage.getItem(CART_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    function saveCart(items) {
        localStorage.setItem(CART_KEY, JSON.stringify(items || []));
        state.items = Array.isArray(items) ? items : [];
    }

    async function readFreshCart() {
        const localCart = readCartLocal();
        if (!localCart.length) return [];

        const freshCart = [];

        for (const item of localCart) {
            const result = await http.request("GET", `${API.product}/${encodeURIComponent(item.productId)}`);
            if (!result.res || !result.res.ok || !result.data) continue;

            const p = result.data;
            const maxQuantity = Number(p.quantity || 0);

            freshCart.push({
                productId: p.id,
                productName: p.productName,
                price: Number(p.price || 0),
                imageUrl: p.imageUrl || "",
                quantity: Math.min(Math.max(Number(item.quantity || 1), 1), Math.max(maxQuantity, 1)),
                maxQuantity: maxQuantity
            });
        }

        saveCart(freshCart);
        return freshCart;
    }

    async function loadCart(clearMessage = true) {
        if (clearMessage) msg.show("cartMsg", "");

        const cart = await readFreshCart();
        state.items = cart;

        renderCart();
        renderSummary();
    }

    function renderCart() {
        const box = dom.byId("cartList");
        if (!box) return;

        if (!state.items.length) {
            box.innerHTML = `
                <div class="empty-box">
                    Giỏ hàng đang trống.<br/>
                    <a class="empty-link" href="/customer">Quay lại trang sản phẩm</a>
                </div>
            `;
            return;
        }

        box.innerHTML = `
            <div class="cart-items">
                ${state.items.map(item => {
            const qty = Number(item.quantity || 0);
            const max = Number(item.maxQuantity || 0);
            const price = Number(item.price || 0);
            const subtotal = qty * price;

            return `
                        <div class="cart-item">
                            <div class="cart-item-image-wrap">
                                ${item.imageUrl
                    ? `<img class="cart-item-image" src="${dom.escAttr(item.imageUrl)}" alt="${dom.escAttr(item.productName || "")}" />`
                    : `<div class="cart-item-image placeholder">No image</div>`}
                            </div>

                            <div class="cart-item-info">
                                <div class="cart-item-name">${dom.esc(item.productName || "")}</div>
                                <div class="cart-item-price">Đơn giá: ${money(price)}</div>
                                <div class="cart-item-stock">Còn lại: ${max}</div>
                                <div class="cart-item-subtotal">Thành tiền: ${money(subtotal)}</div>
                            </div>

                            <div class="cart-item-actions">
                                <div class="qty-box">
                                    <button type="button" class="qty-btn" data-cart-action="decrease" data-product-id="${dom.escAttr(item.productId)}">−</button>
                                    <span class="qty-value">${qty}</span>
                                    <button type="button" class="qty-btn" data-cart-action="increase" data-product-id="${dom.escAttr(item.productId)}">+</button>
                                </div>

                                <button type="button" class="remove-btn" data-cart-action="remove" data-product-id="${dom.escAttr(item.productId)}">
                                    Xóa
                                </button>
                            </div>
                        </div>
                    `;
        }).join("")}
            </div>
        `;
    }

    function renderSummary() {
        const itemKinds = dom.byId("sumItemKinds");
        const quantity = dom.byId("sumQuantity");
        const amount = dom.byId("sumAmount");

        if (!itemKinds || !quantity || !amount) return;

        let totalQuantity = 0;
        let totalAmount = 0;

        for (const item of state.items) {
            const q = Number(item.quantity || 0);
            const p = Number(item.price || 0);

            totalQuantity += q;
            totalAmount += q * p;
        }

        itemKinds.textContent = String(state.items.length);
        quantity.textContent = String(totalQuantity);
        amount.textContent = money(totalAmount);
    }

    function increase(productId) {
        const cart = [...state.items];
        const item = cart.find(x => String(x.productId) === String(productId));
        if (!item) return;

        const currentQty = Number(item.quantity || 1);
        const maxQty = Number(item.maxQuantity || 0);

        if (currentQty >= maxQty) {
            msg.show("cartMsg", "Số lượng đã đạt tối đa tồn kho.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        item.quantity = currentQty + 1;
        saveCart(cart);
        renderCart();
        renderSummary();
    }

    function decrease(productId) {
        const cart = [...state.items];
        const item = cart.find(x => String(x.productId) === String(productId));
        if (!item) return;

        const currentQty = Number(item.quantity || 1);

        if (currentQty <= 1) {
            msg.show("cartMsg", "Số lượng tối thiểu là 1.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        item.quantity = currentQty - 1;
        saveCart(cart);
        renderCart();
        renderSummary();
    }

    function removeItem(productId) {
        const newCart = state.items.filter(x => String(x.productId) !== String(productId));

        saveCart(newCart);
        renderCart();
        renderSummary();

        msg.show("cartMsg", "Đã xóa sản phẩm khỏi giỏ hàng.", "success");
        setTimeout(() => msg.show("cartMsg", ""), 1800);
    }

    function clearCart() {
        localStorage.removeItem(CART_KEY);
        state.items = [];

        renderCart();
        renderSummary();

        msg.show("cartMsg", "Đã xóa toàn bộ giỏ hàng.", "success");
        setTimeout(() => msg.show("cartMsg", ""), 1800);
    }

    async function createOrder() {
        msg.show("cartMsg", "");

        const cart = state.items || [];
        if (!cart.length) {
            msg.show("cartMsg", "Giỏ hàng đang trống.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        const addressId = dom.byId("orderAddressId")?.value || "";
        if (!addressId) {
            msg.show("cartMsg", "Vui lòng chọn địa chỉ giao hàng. Nếu chưa có, hãy vào Quản lý địa chỉ giao hàng để thêm mới.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 2500);
            return;
        }

        const paymentValue = dom.byId("paymentMethod")?.value || "";
        if (paymentValue === "") {
            msg.show("cartMsg", "Vui lòng chọn phương thức thanh toán.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        const invalidQty = cart.find(x => {
            const qty = Number(x.quantity || 0);
            const maxQty = Number(x.maxQuantity || 0);
            return qty < 1 || qty > maxQty;
        });

        if (invalidQty) {
            msg.show("cartMsg", `Số lượng sản phẩm "${invalidQty.productName}" không hợp lệ.`, "error");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        const body = {
            addressId: addressId,
            paymentMethod: paymentValue,
            items: cart.map(x => ({
                productId: x.productId,
                quantity: Number(x.quantity || 0),
                price: Number(x.price || 0)
            }))
        };

        const submitBtn = dom.byId("btnCreateOrder");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Đang tạo đơn...";
        }

        msg.show("cartMsg", "Đang tạo đơn hàng...", "warn");

        try {
            const result = await http.request("POST", API.order, body);

            if (!result.res) {
                msg.show("cartMsg", result.raw || "Không gọi được API tạo đơn hàng.", "error");
                return;
            }

            if (!result.res.ok) {
                msg.show("cartMsg", http.getErrorText(result), "error");
                return;
            }

            localStorage.removeItem(CART_KEY);
            state.items = [];

            renderCart();
            renderSummary();

            if (result.data?.paymentUrl) {
                msg.show("cartMsg", "Tạo đơn hàng thành công. Đang chuyển sang VNPay...", "success");
                setTimeout(() => {
                    window.location.href = result.data.paymentUrl;
                }, 500);
                return;
            }

            msg.show("cartMsg", "Đặt hàng thành công.", "success");
            setTimeout(() => {
                window.location.href = "/customer/orders";
            }, 1000);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Xác nhận đặt hàng";
            }
        }
    }

    function money(v) {
        const n = Number(v || 0);
        return n.toLocaleString("vi-VN") + " đ";
    }

    return {
        reload: loadCart
    };
})();