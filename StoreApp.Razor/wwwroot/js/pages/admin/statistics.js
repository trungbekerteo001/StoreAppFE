window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.adminStatistics = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const role = StoreApp.role;
    const msg = StoreApp.message;

    let currentStat = "financial";

    const configs = {
        financial: {
            title: "Thống kê tài chính",
            subtitle: "Doanh thu Order - Chi phí GRN = Thu nhập thật sự",
            path: "/api/statistic/financial",
            useDate: true,
            columns: ["Ngày", "Số đơn", "Doanh thu Order", "Tiền nhập GRN", "Thu nhập thật sự"],
            rows: items => items.map(x => [
                formatDate(x.date),
                x.orderCount,
                money(x.orderRevenue),
                money(x.grnCost),
                netMoney(x.netIncome)
            ]),
            summary: items => [
                ["Doanh thu Order", money(sum(items, "orderRevenue"))],
                ["Tiền nhập GRN", money(sum(items, "grnCost"))],
                ["Thu nhập thật sự", money(sum(items, "netIncome")), sum(items, "netIncome")],
                ["Số đơn hợp lệ", sum(items, "orderCount")]
            ]
        },

        dailyRevenue: {
            title: "Thống kê doanh thu theo ngày",
            subtitle: "Chỉ tính đơn Paid hoặc Delivered",
            path: "/api/statistic/daily-revenue",
            useDate: true,
            columns: ["Ngày", "Số đơn", "Doanh thu"],
            rows: items => items.map(x => [
                formatDate(x.date),
                x.orderCount,
                money(x.totalRevenue)
            ]),
            summary: items => [
                ["Tổng doanh thu", money(sum(items, "totalRevenue"))],
                ["Tổng số đơn", sum(items, "orderCount")]
            ]
        },

        bestSelling: {
            title: "Thống kê sản phẩm bán chạy",
            subtitle: "Sắp xếp theo số lượng bán giảm dần",
            path: "/api/statistic/best-selling-products",
            useDate: true,
            useTop: true,
            columns: ["#", "Sản phẩm", "Số lượng bán", "Doanh thu"],
            rows: items => items.map((x, i) => [
                i + 1,
                dom.esc(x.productName),
                x.totalQuantitySold,
                money(x.totalRevenue)
            ]),
            summary: items => [
                ["Số sản phẩm", items.length],
                ["Tổng số lượng bán", sum(items, "totalQuantitySold")],
                ["Tổng doanh thu", money(sum(items, "totalRevenue"))]
            ]
        },

        orderStatus: {
            title: "Thống kê đơn hàng theo trạng thái",
            subtitle: "Đếm số đơn theo từng trạng thái",
            path: "/api/statistic/order-status",
            useDate: true,
            columns: ["Trạng thái", "Số đơn"],
            rows: items => items.map(x => [
                dom.esc(x.status),
                x.count
            ]),
            summary: items => [
                ["Tổng số đơn", sum(items, "count")],
                ["Số trạng thái", items.length]
            ]
        },

        lowStock: {
            title: "Thống kê sản phẩm sắp hết hàng",
            subtitle: "Lọc sản phẩm có số lượng tồn nhỏ hơn hoặc bằng ngưỡng",
            path: "/api/statistic/low-stock-products",
            useThreshold: true,
            columns: ["#", "Sản phẩm", "Số lượng tồn"],
            rows: items => items.map((x, i) => [
                i + 1,
                dom.esc(x.productName),
                x.quantity
            ]),
            summary: items => [
                ["Số sản phẩm sắp hết", items.length],
                ["Tổng tồn kho nhóm này", sum(items, "quantity")]
            ]
        },

        paymentMethod: {
            title: "Thống kê doanh thu theo phương thức thanh toán",
            subtitle: "So sánh doanh thu Cash và VNPay",
            path: "/api/statistic/payment-method-revenue",
            useDate: true,
            columns: ["Phương thức thanh toán", "Số đơn", "Doanh thu"],
            rows: items => items.map(x => [
                dom.esc(x.paymentMethod),
                x.orderCount,
                money(x.totalRevenue)
            ]),
            summary: items => [
                ["Tổng doanh thu", money(sum(items, "totalRevenue"))],
                ["Tổng số đơn", sum(items, "orderCount")]
            ]
        },

        categoryRevenue: {
            title: "Thống kê doanh thu theo danh mục sản phẩm",
            subtitle: "GroupBy danh mục từ OrderDetail → Product → Category",
            path: "/api/statistic/category-revenue",
            useDate: true,
            columns: ["#", "Danh mục", "Số lượng bán", "Doanh thu"],
            rows: items => items.map((x, i) => [
                i + 1,
                dom.esc(x.categoryName),
                x.totalQuantitySold,
                money(x.totalRevenue)
            ]),
            summary: items => [
                ["Số danh mục có bán", items.length],
                ["Tổng số lượng bán", sum(items, "totalQuantitySold")],
                ["Tổng doanh thu", money(sum(items, "totalRevenue"))]
            ]
        }
    };

    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        if (!role.guard(["admin"])) return;

        setDefaultDates();
        bindEvents();

        await loadStatistic();
    }

    function bindEvents() {
        document.querySelectorAll(".stat-tab").forEach(btn => {
            btn.addEventListener("click", async () => {
                document.querySelectorAll(".stat-tab").forEach(x => x.classList.remove("active"));
                btn.classList.add("active");

                currentStat = btn.dataset.stat;
                await loadStatistic();
            });
        });

        dom.byId("btnLoadStatistic")?.addEventListener("click", loadStatistic);
    }

    function setDefaultDates() {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

        const from = dom.byId("fromDate");
        const to = dom.byId("toDate");

        if (from && !from.value) from.value = toDateInputValue(firstDay);
        if (to && !to.value) to.value = toDateInputValue(today);
    }

    async function loadStatistic() {
        msg.show("statMsg", "");

        const cfg = configs[currentStat];
        if (!cfg) return;

        dom.setText("tableTitle", cfg.title);
        dom.setText("tableSubTitle", cfg.subtitle);

        const query = buildQuery(cfg);
        if (query === null) return;

        renderLoading(cfg);

        const result = await http.request("GET", cfg.path + query);

        if (!result.res) {
            msg.show("statMsg", result.raw || "Không gọi được API.", "error");
            renderEmpty(cfg, "Không gọi được API.");
            return;
        }

        if (!result.res.ok) {
            msg.show("statMsg", http.getErrorText(result), "error");
            renderEmpty(cfg, "Lỗi tải dữ liệu.");
            return;
        }

        const items = Array.isArray(result.data) ? result.data : [];

        renderSummary(cfg, items);
        renderTable(cfg, items);
    }

    function buildQuery(cfg) {
        const qs = new URLSearchParams();

        if (cfg.useDate) {
            const fromDate = dom.value("fromDate");
            const toDate = dom.value("toDate");

            if (!fromDate || !toDate) {
                msg.show("statMsg", "Vui lòng chọn đủ từ ngày và đến ngày.", "error");
                return null;
            }

            if (fromDate > toDate) {
                msg.show("statMsg", "Từ ngày không được lớn hơn đến ngày.", "error");
                return null;
            }

            qs.set("fromDate", fromDate);
            qs.set("toDate", toDate);
        }

        if (cfg.useTop) {
            qs.set("top", dom.value("topInput") || "10");
        }

        if (cfg.useThreshold) {
            qs.set("threshold", dom.value("thresholdInput") || "10");
        }

        const text = qs.toString();
        return text ? `?${text}` : "";
    }

    function renderLoading(cfg) {
        renderHeader(cfg);

        const tbody = dom.byId("statTbody");
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="${cfg.columns.length}" class="empty-cell">Đang tải dữ liệu...</td>
            </tr>
        `;
    }

    function renderEmpty(cfg, text) {
        renderHeader(cfg);

        const tbody = dom.byId("statTbody");
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="${cfg.columns.length}" class="empty-cell">${dom.esc(text)}</td>
            </tr>
        `;
    }

    function renderHeader(cfg) {
        const thead = dom.byId("statThead");
        if (!thead) return;

        thead.innerHTML = `
            <tr>
                ${cfg.columns.map(x => `<th>${dom.esc(x)}</th>`).join("")}
            </tr>
        `;
    }

    function renderTable(cfg, items) {
        renderHeader(cfg);

        const tbody = dom.byId("statTbody");
        if (!tbody) return;

        if (!items.length) {
            renderEmpty(cfg, "Không có dữ liệu thống kê.");
            return;
        }

        const rows = cfg.rows(items);

        tbody.innerHTML = rows.map(row => `
            <tr>
                ${row.map(cell => `<td>${cell}</td>`).join("")}
            </tr>
        `).join("");
    }

    function renderSummary(cfg, items) {
        const box = dom.byId("summaryGrid");
        if (!box) return;

        const summaries = cfg.summary(items);

        box.innerHTML = summaries.map(x => {
            const label = x[0];
            const value = x[1];
            const rawValue = x.length >= 3 ? Number(x[2] || 0) : null;

            let cls = "stat-card";
            if (rawValue !== null) {
                cls += rawValue >= 0 ? " positive" : " negative";
            }

            return `
                <div class="${cls}">
                    <div class="label">${dom.esc(label)}</div>
                    <div class="value">${value}</div>
                </div>
            `;
        }).join("");
    }

    function sum(items, field) {
        return items.reduce((total, x) => total + Number(x[field] || 0), 0);
    }

    function money(value) {
        return Number(value || 0).toLocaleString("vi-VN") + " đ";
    }

    function netMoney(value) {
        const n = Number(value || 0);
        const cls = n >= 0 ? "money-plus" : "money-minus";
        return `<span class="${cls}">${money(n)}</span>`;
    }

    function formatDate(value) {
        if (!value) return "";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString("vi-VN");
    }

    function toDateInputValue(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
})();