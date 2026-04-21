window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.customerCart = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const role = StoreApp.role;
    const msg = StoreApp.message;

    const API = {
        cart: "/api/Cart",
        order: "/api/Order"
    };

    const state = {
        items: []
    };

    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        if (!role.guard(["Customer"])) return;

        bindEvents();
        await loadCart();
    }

    function bindEvents() {
        dom.byId("btnCartClear")?.addEventListener("click", clearCart);
        dom.byId("btnCreateOrder")?.addEventListener("click", createOrder);

        document.addEventListener("click", async (e) => {
            const btn = e.target.closest("[data-cart-action]");
            if (!btn) return;

            const action = btn.dataset.cartAction;
            const productId = btn.dataset.productId || "";

            if (action === "increase") await increase(productId);
            if (action === "decrease") await decrease(productId);
            if (action === "remove") await removeItem(productId);
        });
    }

    async function loadCart(clearMessage = true) {
        if (clearMessage) msg.show("cartMsg", "");

        const box = dom.byId("cartList");
        if (box) {
            box.innerHTML = `<div class="empty-box">Đang tải giỏ hàng...</div>`;
        }

        const result = await http.request("GET", API.cart);

        if (!result.res) {
            msg.show("cartMsg", result.raw || "Không gọi được API giỏ hàng.", "error");
            state.items = [];
            renderCart();
            renderSummary();
            return;
        }

        if (!result.res.ok) {
            msg.show("cartMsg", http.getErrorText(result), "error");
            state.items = [];
            renderCart();
            renderSummary();
            return;
        }

        applyCartData(result.data);
        renderCart();
        renderSummary();
    }

    function applyCartData(data) {
        const items = Array.isArray(data?.items) ? data.items : [];

        state.items = items.map(x => ({
            cartItemId: x.cartItemId || x.id || "",
            productId: x.productId || "",
            productName: x.productName || "",
            imageUrl: x.imageUrl || "",
            price: Number(x.price || 0),
            quantity: Number(x.quantity || 0),
            stockQuantity: Number(x.stockQuantity ?? x.maxQuantity ?? 0),
            totalPrice: Number(x.totalPrice || 0)
        }));
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
            const productId = String(item.productId || "");
            const qty = Number(item.quantity || 0);
            const stock = Number(item.stockQuantity || 0);
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
                                <div class="cart-item-stock">Còn lại: ${stock}</div>
                                <div class="cart-item-subtotal">Thành tiền: ${money(subtotal)}</div>
                            </div>

                            <div class="cart-item-actions">
                                <div class="qty-box">
                                    <button type="button" class="qty-btn" data-cart-action="decrease" data-product-id="${dom.escAttr(productId)}">−</button>
                                    <span class="qty-value">${qty}</span>
                                    <button type="button" class="qty-btn" data-cart-action="increase" data-product-id="${dom.escAttr(productId)}">+</button>
                                </div>

                                <button type="button" class="remove-btn" data-cart-action="remove" data-product-id="${dom.escAttr(productId)}">
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

    async function increase(productId) {
        const item = state.items.find(x => String(x.productId) === String(productId));
        if (!item) return;

        const currentQty = Number(item.quantity || 1);
        const stockQty = Number(item.stockQuantity || 0);

        if (currentQty >= stockQty) {
            msg.show("cartMsg", "Số lượng đã đạt tối đa tồn kho.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        await updateQuantity(productId, currentQty + 1);
    }

    async function decrease(productId) {
        const item = state.items.find(x => String(x.productId) === String(productId));
        if (!item) return;

        const currentQty = Number(item.quantity || 1);

        if (currentQty <= 1) {
            msg.show("cartMsg", "Số lượng tối thiểu là 1.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        await updateQuantity(productId, currentQty - 1);
    }

    async function updateQuantity(productId, quantity) {
        msg.show("cartMsg", "");

        const result = await http.request("PUT", `${API.cart}/items/${encodeURIComponent(productId)}`, {
            quantity: quantity
        });

        if (!result.res) {
            msg.show("cartMsg", result.raw || "Không gọi được API cập nhật giỏ hàng.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("cartMsg", http.getErrorText(result), "error");
            return;
        }

        applyCartData(result.data);
        renderCart();
        renderSummary();
    }

    async function removeItem(productId) {
        msg.show("cartMsg", "");

        const result = await http.request("DELETE", `${API.cart}/items/${encodeURIComponent(productId)}`);

        if (!result.res) {
            msg.show("cartMsg", result.raw || "Không gọi được API xóa sản phẩm khỏi giỏ hàng.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("cartMsg", http.getErrorText(result), "error");
            return;
        }

        await loadCart(false);

        msg.show("cartMsg", "Đã xóa sản phẩm khỏi giỏ hàng.", "success");
        setTimeout(() => msg.show("cartMsg", ""), 1800);
    }

    async function clearCart() {
        msg.show("cartMsg", "");

        if (!state.items.length) {
            msg.show("cartMsg", "Giỏ hàng đang trống.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        const result = await http.request("DELETE", API.cart);

        if (!result.res) {
            msg.show("cartMsg", result.raw || "Không gọi được API xóa giỏ hàng.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("cartMsg", http.getErrorText(result), "error");
            return;
        }

        state.items = [];
        renderCart();
        renderSummary();

        msg.show("cartMsg", "Đã xóa toàn bộ giỏ hàng.", "success");
        setTimeout(() => msg.show("cartMsg", ""), 1800);
    }

    async function createOrder() {
        msg.show("cartMsg", "");

        if (!state.items.length) {
            msg.show("cartMsg", "Giỏ hàng đang trống.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        const address = dom.byId("orderAddress")?.value?.trim() || "";
        if (!address) {
            msg.show("cartMsg", "Vui lòng nhập địa chỉ giao hàng.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        const paymentValue = dom.byId("paymentMethod")?.value || "";
        if (!paymentValue) {
            msg.show("cartMsg", "Vui lòng chọn phương thức thanh toán.", "warn");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        const invalidQty = state.items.find(x => {
            const qty = Number(x.quantity || 0);
            const stockQty = Number(x.stockQuantity || 0);
            return qty < 1 || qty > stockQty;
        });

        if (invalidQty) {
            msg.show("cartMsg", `Số lượng sản phẩm "${invalidQty.productName}" không hợp lệ.`, "error");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        const body = {
            address: address,
            paymentMethod: paymentValue
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