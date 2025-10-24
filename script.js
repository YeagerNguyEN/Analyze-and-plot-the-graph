document.addEventListener("DOMContentLoaded", () => {
  const functionInput = document.getElementById("functionInput");
  const surveyBtn = document.getElementById("surveyBtn");
  const resultsDiv = document.getElementById("results");
  const canvas = document.getElementById("graphCanvas");
  const ctx = canvas.getContext("2d");

  const width = canvas.width;
  const height = canvas.height;
  const scale = 30; // 30 pixels for 1 unit
  const origin = { x: width / 2, y: height / 2 };

  function surveyAndDraw() {
    const funcStr = functionInput.value;
    if (!funcStr) {
      resultsDiv.innerHTML = '<p style="color: red;">Vui lòng nhập hàm số.</p>';
      return;
    }

    try {
      // -- Phần 1: Khảo sát hàm số --
      const node = math.parse(funcStr);
      const compiledFunc = node.compile(); // Bổ sung: 1.0. Tìm tập xác định

      const domain = findDomain(node); // <--- Đã gọi hàm cải tiến
      let resultsHTML = `<h2>Kết quả Khảo sát</h2>`;
      resultsHTML += `<h3>Hàm số:</h3><p>y = ${node.toString()}</p>`;
      resultsHTML += `<h3>Tập xác định:</h3><p>${domain}</p>`; // <--- Hiển thị kết quả mới // 1.1. Tính đạo hàm
      const derivativeNode = math.derivative(node, "x");
      const compiledDerivative = derivativeNode.compile();

      resultsHTML += `<h3>Đạo hàm:</h3><p>y' = ${derivativeNode.toString()}</p>`; // 1.2. Tìm nghiệm đạo hàm (điểm cực trị)

      const criticalPoints = findRoots(compiledDerivative, -10, 10, 0.001); // Lọc bỏ các điểm cực trị không hợp lệ (NaN hoặc Infinity)
      const validCriticalPoints = criticalPoints.filter(
        (p) => isFinite(p) && !isNaN(p)
      );
      if (validCriticalPoints.length > 0) {
        // Chỉ lấy các điểm không trùng lặp và sắp xếp
        const uniqueCriticalPoints = [
          ...new Set(validCriticalPoints.map((x) => parseFloat(x.toFixed(3)))),
        ].sort((a, b) => a - b);
        const extrema = uniqueCriticalPoints
          .map((x) => ({
            x: x,
            y: compiledFunc.evaluate({ x: x }),
          }))
          .filter((p) => isFinite(p.y) && !isNaN(p.y)); // Lọc cực trị có giá trị y hợp lệ
        resultsHTML += `<h3>Điểm cực trị:</h3>`;
        if (extrema.length > 0) {
          extrema.forEach((p) => {
            resultsHTML += `<p>(${p.x.toFixed(3)}; ${p.y.toFixed(3)})</p>`;
          });
        } else {
          resultsHTML += `<p>Không có điểm cực trị hợp lệ trong khoảng khảo sát.</p>`;
        } // 1.3. Vẽ bảng biến thiên - dùng uniqueCriticalPoints

        resultsHTML += `<h3>Bảng biến thiên:</h3>`;
        resultsHTML += createVariationTable(
          // <--- Đã gọi hàm cải tiến
          compiledFunc,
          compiledDerivative,
          uniqueCriticalPoints
        );
      } else {
        resultsHTML += `<h3>Điểm cực trị:</h3><p>Không có điểm cực trị trong khoảng khảo sát.</p>`; // 1.3. Vẽ bảng biến thiên - không có điểm cực trị
        resultsHTML += `<h3>Bảng biến thiên:</h3>`;
        resultsHTML += createVariationTable(
          // <--- Đã gọi hàm cải tiến
          compiledFunc,
          compiledDerivative,
          []
        );
      }

      resultsDiv.innerHTML = resultsHTML; // -- Phần 2: Vẽ đồ thị --

      drawGraph(compiledFunc);
    } catch (error) {
      resultsDiv.innerHTML = `<h2 style="color: red;">Lỗi!</h2><p>Hàm số không hợp lệ. Vui lòng kiểm tra lại.<br>Chi tiết: ${error.message}</p>`;
      clearCanvas();
    }
  } // HÀM TÌM TẬP XÁC ĐỊNH (ĐÃ CẢI TIẾN)

  // ================================================================== //
  // ================================================================== //
  /**
   * Phân tích sâu cây cú pháp để tìm TẤT CẢ các điều kiện.
   * Kết hợp chúng lại bằng ký hiệu "và" (∧).
   */
  function findDomain(node) {
    let restrictions = []; // Sử dụng mảng để lưu TẤT CẢ các điều kiện

    // Dùng hàm .traverse() để duyệt qua mọi nút con
    node.traverse(function (n) {
      if (n.isOperatorNode) {
        // 1. Phép chia: Mẫu số khác 0
        if (n.op === "/" && n.args.length === 2) {
          const denominator = n.args[1].toString();
          // Tránh thêm điều kiện dư thừa như '1 != 0'
          if (denominator !== "1" && denominator !== "-1") {
            restrictions.push(` ${denominator} ≠ 0`);
          }
        }
      } else if (n.isFunctionNode) {
        // 2. Căn bậc hai: Biểu thức dưới căn >= 0
        if (n.fn === "sqrt" && n.args.length === 1) {
          const insideSqrt = n.args[0].toString();
          restrictions.push(` ${insideSqrt} ≥ 0`);
        }
        // 3. Logarithm: Biểu thức trong log > 0
        else if (n.fn === "log" && n.args.length === 1) {
          const inside = n.args[0].toString();
          restrictions.push(` ${inside} > 0`);
        }
        // 4. Lũy thừa âm (vd: x^-2 = 1/x^2)
        else if (n.fn === "pow" && n.args.length === 2) {
          const power = n.args[1];
          if (power.isConstantNode && power.value < 0) {
            const base = n.args[0].toString();
            restrictions.push(` ${base} ≠ 0`);
          }
        }
        // 5. Hàm lượng giác
        else if (n.fn === "tan" && n.args.length === 1) {
          const inside = n.args[0].toString();
          restrictions.push(` ${inside} ≠ π/2 + kπ, k∈ℤ`);
        } else if (n.fn === "cot" && n.args.length === 1) {
          const inside = n.args[0].toString();
          restrictions.push(` ${inside} ≠ kπ, k∈ℤ`);
        }
      }
    });

    // Loại bỏ các điều kiện trùng lặp
    const uniqueRestrictions = [...new Set(restrictions)];

    if (uniqueRestrictions.length === 0) {
      return "D = ℝ"; // Tập xác định là toàn bộ số thực
    }

    // Trả về tập hợp các điều kiện
    return `D = {x ∈ ℝ |${uniqueRestrictions.join(" ∧")} }`;
  }

  // ================================================================== //
  // HÀM TÌM NGHIỆM (KHÔNG THAY ĐỔI)
  // ================================================================== //
  function findRoots(func, start, end, step) {
    const roots = [];
    let y1 = func.evaluate({ x: start });
    for (let x = start + step; x <= end; x += step) {
      let y2 = func.evaluate({ x: x }); // Thay đổi dấu hoặc đi qua 0
      if (y1 * y2 < 0) {
        roots.push(x - step / 2);
      } // Xử lý trường hợp chạm trục Ox (cực trị kép)
      if (Math.abs(y2) < 1e-4) {
        roots.push(x);
      }
      y1 = y2;
    }
    return roots;
  } // HÀM TẠO BẢNG BIẾN THIÊN (ĐÃ VIẾT LẠI HOÀN TOÀN)

  // ================================================================== //
  // ================================================================== //
  /**
   * Tạo bảng biến thiên với cấu trúc cột xen kẽ (Điểm - Khoảng - Điểm - Khoảng)
   * Đảm bảo các hàng x, y', y luôn thẳng cột.
   */
  function createVariationTable(func, derivativeFunc, criticalPoints) {
    const points = [-Infinity, ...criticalPoints, Infinity];

    // 3 mảng để lưu nội dung các ô (cells)
    let x_row = [];
    let df_row = []; // y'
    let f_row = []; // y

    // Các hàm helper để định dạng
    const formatSign = (sign) => {
      if (sign === "+")
        return '<span style="color: green; font-weight: bold;">+</span>';
      if (sign === "-")
        return '<span style="color: red; font-weight: bold;">-</span>';
      if (sign === "||")
        return '<span style="color: #ccc; font-weight: bold;">||</span>';
      return '<span style="color: gray;">?</span>';
    };
    const formatArrow = (sign) => {
      if (sign === "+")
        return '<span style="color: green; font-size: 1.5em; font-weight: bold;">↗</span>';
      if (sign === "-")
        return '<span style="color: red; font-size: 1.5em; font-weight: bold;">↘</span>';
      if (sign === "||")
        return '<span style="color: #ccc; font-weight: bold;">||</span>';
      return '<span style="color: gray;">—</span>';
    };

    // Duyệt qua từng ĐIỂM (points[i]) và KHOẢNG (giữa points[i] và points[i+1])
    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      // --- 1. Xử lý CỘT ĐIỂM ---
      if (p === -Infinity) {
        x_row.push("−∞");
        df_row.push(""); // Không có y' tại vô cùng
        // TODO: Tính giới hạn của f(x) khi x -> -Inf
        f_row.push("?"); // Giả định
      } else if (p === Infinity) {
        x_row.push("+∞");
        df_row.push(""); // Không có y' tại vô cùng
        // TODO: Tính giới hạn của f(x) khi x -> +Inf
        f_row.push("?"); // Giả định
      } else {
        // Điểm hữu hạn (Cực trị)
        x_row.push(p.toFixed(2));

        // Tính y' tại điểm đó
        try {
          const df_val = derivativeFunc.evaluate({ x: p });
          if (Math.abs(df_val) < 1e-4) {
            df_row.push("0");
          } else if (!isFinite(df_val)) {
            df_row.push(
              '<span style="color: #ccc; font-weight: bold;">||</span>'
            ); // y' không xác định
          } else {
            df_row.push("?"); // Lỗi logic (không phải nghiệm?)
          }
        } catch (e) {
          df_row.push(
            '<span style="color: #ccc; font-weight: bold;">||</span>'
          ); // y' không xác định
        }

        // Tính y tại điểm đó
        try {
          const f_val = func.evaluate({ x: p });
          if (!isFinite(f_val)) {
            f_row.push(
              '<span style="color: #ccc; font-weight: bold;">||</span>'
            );
          } else {
            f_row.push(f_val.toFixed(3));
          }
        } catch (e) {
          f_row.push('<span style="color: #ccc; font-weight: bold;">||</span>'); // y không xác định
        }
      }

      // --- 2. Xử lý CỘT KHOẢNG (nếu đây không phải điểm cuối cùng) ---
      if (i < points.length - 1) {
        const p_next = points[i + 1];

        // Tìm điểm kiểm tra (testPoint)
        let testPoint;
        if (p === -Infinity) testPoint = p_next - 1;
        else if (p_next === Infinity) testPoint = p + 1;
        else testPoint = (p + p_next) / 2;

        // Tính dấu y'
        let sign = "?";
        try {
          const df_val = derivativeFunc.evaluate({ x: testPoint });
          if (!isFinite(df_val)) sign = "||";
          else if (df_val > 1e-4) sign = "+";
          else if (df_val < -1e-4) sign = "-";
        } catch (e) {
          sign = "||"; // y' không xác định trên khoảng
        }

        x_row.push(""); // Ô trống trên hàng x
        df_row.push(formatSign(sign));
        f_row.push(formatArrow(sign));
      }
    }

    // --- 3. Xây dựng HTML từ các mảng đã chuẩn bị ---
    let table = `<table class="variation-table" style="border-collapse: collapse; text-align: center;">`;

    // Hàng x
    table += `<tr style="border-bottom: 1px solid #aaa;"><th style="padding: 8px 12px; min-width: 30px;">x</th>`;
    x_row.forEach((cell, i) => {
      const style =
        i % 2 === 0
          ? "font-weight: bold;"
          : "border-left: 1px solid #eee; border-right: 1px solid #eee;";
      table += `<td style="padding: 8px 12px; min-width: 60px; ${style}">${cell}</td>`;
    });
    table += `</tr>`;

    // Hàng y'
    table += `<tr style="border-bottom: 1px solid #aaa;"><th style="padding: 8px 12px;">y'</th>`;
    df_row.forEach((cell, i) => {
      const style =
        i % 2 === 0
          ? "font-weight: bold;"
          : "border-left: 1px solid #eee; border-right: 1px solid #eee;";
      table += `<td style="padding: 8px 12px; ${style}">${cell}</td>`;
    });
    table += `</tr>`;

    // Hàng y
    table += `<tr><th style="padding: 8px 12px;">y</th>`;
    f_row.forEach((cell, i) => {
      const style =
        i % 2 === 0
          ? "font-weight: bold;"
          : "border-left: 1px solid #eee; border-right: 1px solid #eee; vertical-align: middle;";
      table += `<td style="padding: 8px 12px; ${style}">${cell}</td>`;
    });
    table += `</tr>`;

    table += `</table>`;
    return table;
  } // -- Các hàm vẽ (KHÔNG THAY ĐỔI) --

  function clearCanvas() {
    ctx.clearRect(0, 0, width, height);
  }

  function drawGridAndAxes() {
    ctx.strokeStyle = "#e0e0e0"; // Màu lưới
    ctx.lineWidth = 1; // Lưới dọc

    for (let i = origin.x % scale; i < width; i += scale) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    } // Lưới ngang
    for (let i = origin.y % scale; i < height; i += scale) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    } // Trục tọa độ

    ctx.strokeStyle = "#000"; // Màu trục
    ctx.lineWidth = 2; // Trục Ox
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(width, origin.y);
    ctx.stroke(); // Trục Oy
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, height);
    ctx.stroke(); // Ghi số trên trục

    ctx.fillStyle = "#555";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle"; // Số trên trục Ox

    for (let i = 1; i * scale < origin.x; i++) {
      ctx.fillText(-i, origin.x - i * scale, origin.y + 15);
      ctx.fillText(i, origin.x + i * scale, origin.y + 15);
    } // Số trên trục Oy
    for (let i = 1; i * scale < origin.y; i++) {
      ctx.fillText(i, origin.x - 15, origin.y - i * scale);
      ctx.fillText(-i, origin.x - 15, origin.y + i * scale);
    }
  }

  function drawGraph(func) {
    clearCanvas();
    drawGridAndAxes();

    const xMin = -origin.x / scale;
    const xMax = (width - origin.x) / scale;
    const step = 1 / scale; // Vẽ tiệm cận đứng (phát hiện bằng cách kiểm tra giá trị y lớn đột biến)

    ctx.strokeStyle = "#00f"; // Màu tiệm cận
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    let lastY = null;
    for (let x = xMin; x <= xMax; x += step) {
      try {
        const y = func.evaluate({ x: x });
        if (lastY !== null) {
          // Nếu y nhảy từ dương vô cùng -> âm vô cùng hoặc ngược lại
          if (Math.abs(y - lastY) > height) {
            ctx.beginPath();
            ctx.moveTo(origin.x + x * scale, 0);
            ctx.lineTo(origin.x + x * scale, height);
            ctx.stroke();
          }
        }
        lastY = y;
      } catch (e) {}
    }
    ctx.setLineDash([]); // Reset nét liền // Vẽ đồ thị hàm số

    ctx.strokeStyle = "#e74c3c"; // Màu đồ thị
    ctx.lineWidth = 2;
    ctx.beginPath();

    let firstPoint = true;
    for (let pixelX = 0; pixelX < width; pixelX++) {
      const mathX = (pixelX - origin.x) / scale;
      try {
        const mathY = func.evaluate({ x: mathX });
        if (isFinite(mathY)) {
          const pixelY = origin.y - mathY * scale;
          if (firstPoint) {
            ctx.moveTo(pixelX, pixelY);
            firstPoint = false;
          } else {
            // Cắt đường nếu điểm y quá xa nhau (tránh đường kẻ ngang qua tiệm cận)
            const prevMathY = func.evaluate({
              x: (pixelX - 1 - origin.x) / scale,
            });
            if (Math.abs(mathY - prevMathY) < (height / scale) * 1.5) {
              ctx.lineTo(pixelX, pixelY);
            } else {
              ctx.moveTo(pixelX, pixelY);
            }
          }
        } else {
          firstPoint = true; // Bắt đầu lại đường mới nếu gặp điểm gián đoạn
        }
      } catch (e) {
        firstPoint = true;
      }
    }
    ctx.stroke();
  } // Chạy lần đầu khi tải trang với hàm mặc định

  surveyAndDraw();

  surveyBtn.addEventListener("click", surveyAndDraw);
  functionInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      surveyAndDraw();
    }
  });
});
