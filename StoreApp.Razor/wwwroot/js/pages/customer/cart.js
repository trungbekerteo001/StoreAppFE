window.StoreApp = window.StoreApp || {};                // object toàn cục
window.StoreApp.pages = window.StoreApp.pages || {};    // object con để chứa logic riêng của từng page

    // IIFE - toàn bộ hàm và biến của page chỉ dùng trong phạm vi này để tránh xung đột tên
StoreApp.pages.customerCart = (() => {
    const dom = StoreApp.dom;               // chứa các phương thức thao tác DOM
    const http = StoreApp.http;             // chứa phương thức request để gọi API
    const role = StoreApp.role;             // chứa phương thức guard và decode role/token
    const auth = StoreApp.auth;             // chứa các phương thức lấy access token
    const msg = StoreApp.message;           // chứa phương thức show để hiển thị thông báo

    const API = {                       // chứa endpoint API dùng trong page này
        product: "/api/Product",
        order: "/api/Order"
    };

    const CART_KEY = "customer_cart";

    const state = {                     // state để lưu trạng thái hiện tại của page
        items: []
    };

    // khi DOM đã sẵn sàng thì gọi hàm initPage để khởi tạo page
    document.addEventListener("DOMContentLoaded", initPage);

    // hàm khởi tạo page giỏ hàng: kiểm tra role, gán event rồi load cart

    async function initPage() {
        if (!role.guard(["Customer"])) return;

        bindEvents();
        await loadCart();
    }

    // gán event cho nút xóa giỏ, đặt hàng và các nút thao tác 
    function bindEvents() {
        dom.byId("btnCartClear")?.addEventListener("click", clearCart);
        dom.byId("btnCreateOrder")?.addEventListener("click", createOrder);

        document.addEventListener("click", (e) => {         // sự kiện click chung cho tất cả nút tăng, giảm, xóa trong giỏ hàng nhờ data attribute
            const btn = e.target.closest("[data-cart-action]");
            if (!btn) return;

            const action = btn.dataset.cartAction;
            const productId = btn.dataset.productId || "";

            if (action === "increase") increase(productId);
            if (action === "decrease") decrease(productId);
            if (action === "remove") removeItem(productId);
        });
    }

    // đọc giỏ hàng từ localStorage

    function readCartLocal() {
        try {
            const raw = localStorage.getItem(CART_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    // lưu giỏ hàng xuống localStorage đồng thời cập nhật state hiện tại

    function saveCart(items) {
        localStorage.setItem(CART_KEY, JSON.stringify(items || []));
        state.items = Array.isArray(items) ? items : [];
    }

    // đọc giỏ hàng local rồi gọi API để làm mới tên, giá và tồn kho của từng sản phẩm

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

    // tải giỏ hàng hiện tại rồi render danh sách và phần tóm tắt

    async function loadCart(clearMessage = true) {
        if (clearMessage) msg.show("cartMsg", "");

        const cart = await readFreshCart();
        state.items = cart;

        renderCart();
        renderSummary();
    }

    // render toàn bộ sản phẩm đang có trong giỏ hàng

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

    // tính và hiển thị tổng số loại hàng, tổng số lượng và tổng tiền

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

    // tăng số lượng 1 sản phẩm nhưng không vượt quá tồn kho hiện tại

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

    // giảm số lượng 1 sản phẩm nhưng không nhỏ hơn 1

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

    // xóa 1 sản phẩm khỏi giỏ hàng

    function removeItem(productId) {
        const newCart = state.items.filter(x => String(x.productId) !== String(productId));

        saveCart(newCart);
        renderCart();
        renderSummary();

        msg.show("cartMsg", "Đã xóa sản phẩm khỏi giỏ hàng.", "success");
        setTimeout(() => msg.show("cartMsg", ""), 1800);
    }

    // xóa toàn bộ giỏ hàng

    function clearCart() {
        localStorage.removeItem(CART_KEY);
        state.items = [];

        renderCart();
        renderSummary();

        msg.show("cartMsg", "Đã xóa toàn bộ giỏ hàng.", "success");
        setTimeout(() => msg.show("cartMsg", ""), 1800);
    }

    // đọc customerId từ access token hiện tại

    function getCurrentCustomerId() {
        const token = auth.getAccessToken();
        if (!token) return null;

        const payload = role.decodeJwtPayload(token);
        if (!payload) return null;

        return (
            payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ||
            payload.nameid ||
            payload.sub ||
            null
        );
    }

    // validate dữ liệu giỏ hàng rồi gọi API tạo đơn hàng

    async function createOrder() {
        msg.show("cartMsg", "");

        const cart = state.items || [];
        if (!cart.length) {
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

        const customerId = getCurrentCustomerId();
        if (!customerId) {
            msg.show("cartMsg", "Không lấy được thông tin khách hàng từ token.", "error");
            setTimeout(() => msg.show("cartMsg", ""), 1800);
            return;
        }

        const body = {
            customerId: customerId,
            address: address,
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

    // format tiền tệ theo kiểu Việt Nam

    function money(v) {
        const n = Number(v || 0);
        return n.toLocaleString("vi-VN") + " đ";
    }

    return {
        reload: loadCart
    };
})();