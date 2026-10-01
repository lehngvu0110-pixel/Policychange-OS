// @ts-check
/**
 * Dữ liệu mẫu (tổng hợp, do nhóm tự soạn) cho chế độ trình diễn và bộ Verify.
 * Không phải văn bản thật của bất kỳ đơn vị nào.
 */
(function attachPolicyData(/** @type {any} */ root, /** @type {(...args:any[]) => any} */ factory) {
  const api = factory();
  // @ts-ignore -- CommonJS export khi chạy trong Node.
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PolicyChangeData = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPolicyData() {
  'use strict';

  /** @template T @param {T} value @returns {T} */
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(/** @type {any} */ (value)[key]));
    return Object.freeze(value);
  }

  /* Sổ đăng ký quy định: mỗi quy định = một giá trị có hiệu lực + hai loại cụm từ:
   - aliases  (neo chủ đề): dòng đang nói về việc gì — "phúc khảo", "tạm ứng".
   - measures (neo đại lượng): con số đo cái gì của việc đó — "nộp", "thời hạn", "duyệt".
   Chỉ tự sửa khi dòng có CẢ HAI (QT-KSTL-01 §5.4). measures rỗng nghĩa là neo chủ đề đã đủ hẹp
   (ví dụ "hai chữ ký" tự nó đã nói ngưỡng gì). Danh sách lấy từ tên quy định và kho mẫu, KHÔNG lấy từ tập mù. */
  const SEED_REGISTRY = [
  { id:"R-PK-01", name:"Thời hạn sinh viên nộp đơn phúc khảo", value:"7 ngày", tier:3,
    source:"Điều 24.1 Quy định công tác học vụ", owner:"Phòng Đào tạo",
    aliases:["phúc khảo","chấm lại bài thi","đề nghị chấm lại"],
    measures:["nộp","tiếp nhận","thời hạn","hạn nộp","trong hạn","quá hạn","đề nghị","kể từ ngày công bố"] },
  { id:"R-KN-01", name:"Thời hạn đơn vị phản hồi đơn khiếu nại của người học", value:"7 ngày", tier:3,
    source:"Điều 31.1 Quy định công tác học vụ", owner:"Phòng Thanh tra – Pháp chế",
    aliases:["khiếu nại","tố cáo","đơn thư"],
    measures:["phản hồi","trả lời","giải quyết","xử lý","xem xét"] },
  { id:"R-XN-01", name:"Thời gian cấp giấy xác nhận sinh viên", value:"3 ngày", tier:2,
    source:"Bước 4 Quy trình cấp giấy xác nhận sinh viên", owner:"Phòng Công tác Sinh viên",
    aliases:["xác nhận sinh viên","giấy xác nhận"],
    measures:["cấp","trả","xử lý","giải quyết"] },
  { id:"R-DK-01", name:"Khối lượng đăng ký tối đa mỗi học kỳ", value:"24 tín chỉ", tier:3,
    source:"Điều 37.1 Quy định công tác học vụ", owner:"Phòng Đào tạo",
    aliases:["đăng ký học phần","khối lượng học tập","tín chỉ tối đa"],
    measures:["tối đa","không quá","không vượt","vượt","nhiều nhất","trở xuống","giới hạn"] },
  { id:"R-TC-01", name:"Hạn mức tạm ứng do Trưởng đơn vị duyệt", value:"10 triệu", tier:3,
    source:"Điều 12.1 Quy chế chi tiêu nội bộ", owner:"Phòng Kế hoạch – Tài chính",
    aliases:["tạm ứng","hoàn ứng","đề nghị ứng"],
    measures:["duyệt","hạn mức","trưởng đơn vị","thẩm quyền"] },
  { id:"R-TC-02", name:"Ngưỡng khoản chi phải có hai chữ ký kiểm soát", value:"10 triệu", tier:3,
    source:"Điều 19.2 Quy chế chi tiêu nội bộ", owner:"Phòng Kế hoạch – Tài chính",
    aliases:["hai chữ ký","đồng ký","kiểm soát chi"],
    measures:[] }
];

  /* Kho tài liệu: tier 1 = tài liệu tác nghiệp · 2 = quy trình cấp Phòng/Ban · 3 = quy định cấp Trường. */
  const SEED_DOCUMENTS = [
  { id:"QD-01", title:"Quy định về công tác học vụ", owner:"Hội đồng Trường", tier:3, version:"3.2", lines:[
    "Điều 24. Phúc khảo bài thi kết thúc học phần",
    "24.1. Sinh viên có nguyện vọng phúc khảo nộp đơn tại Phòng Đào tạo trong thời hạn 7 ngày kể từ ngày công bố điểm.",
    "24.2. Kết quả phúc khảo được công bố chậm nhất 15 ngày kể từ ngày hết hạn nhận đơn.",
    "Điều 37. Khối lượng học tập",
    "37.1. Sinh viên đăng ký học phần tối đa 24 tín chỉ trong một học kỳ chính."
  ]},
  { id:"QT-02", title:"Quy trình tổ chức chấm phúc khảo bài thi", owner:"Phòng Đào tạo", tier:2, version:"1.4", lines:[
    "B1. Tiếp nhận đơn phúc khảo của sinh viên trong 7 ngày kể từ ngày công bố điểm; quá hạn thì từ chối tiếp nhận.",
    "B2. Chuyên viên lập danh sách đề nghị chấm lại, chuyển Khoa trong 2 ngày làm việc.",
    "B3. Khoa tổ chức chấm lại bài thi và gửi kết quả về Phòng Đào tạo.",
    "B4. Công bố kết quả phúc khảo và cập nhật điểm trên hệ thống.",
    "Ghi chú: Mốc 7 ngày nộp đơn phúc khảo tại B1 được tính theo ngày lịch, không trừ ngày nghỉ."
  ]},
  { id:"BM-03", title:"Đơn đề nghị phúc khảo bài thi (BM-ĐT-07)", owner:"Phòng Đào tạo", tier:2, version:"2.0", lines:[
    "Kính gửi: Phòng Đào tạo, Trường Đại học Bách Khoa.",
    "Lưu ý: Đơn phúc khảo chỉ hợp lệ khi nộp trong 7 ngày kể từ ngày công bố điểm học phần.",
    "Sinh viên ký tên và ghi rõ họ tên ở cuối đơn."
  ]},
  { id:"HD-04", title:"Hướng dẫn sinh viên — Hỏi đáp về điểm và phúc khảo", owner:"Cổng thông tin sinh viên", tier:1, version:"5.1", lines:[
    "Hỏi: Em muốn phúc khảo thì nộp đơn ở đâu và trong bao lâu?",
    "Đáp: Em nộp đơn phúc khảo tại quầy Một cửa trong vòng 7 ngày kể từ ngày công bố điểm.",
    "Hỏi: Nếu em phát hiện sai sót sau khi đã hết hạn thì sao?",
    "Đáp: Em liên hệ trực tiếp giảng viên phụ trách. Phòng thi chỉ lưu bài trong 7 ngày trước khi chuyển kho lưu trữ."
  ]},
  { id:"CL-05", title:"Checklist tiếp nhận hồ sơ tại quầy Một cửa", owner:"Phòng Công tác Sinh viên", tier:1, version:"1.9", lines:[
    "[ ] Kiểm tra thẻ sinh viên còn hiệu lực.",
    "[ ] Với đơn phúc khảo: đối chiếu ngày công bố điểm, còn trong hạn 7 ngày thì nhận.",
    "[ ] Với giấy xác nhận sinh viên: hẹn trả kết quả sau 3 ngày làm việc.",
    "[ ] Ghi số biên nhận vào sổ theo dõi."
  ]},
  { id:"EM-06", title:"Mẫu thư tự động gửi sinh viên", owner:"Phòng Đào tạo", tier:1, version:"1.2", lines:[
    "[PHUC_KHAO_NHAN_DON] Nhà trường đã nhận đơn phúc khảo của bạn.",
    "[PHUC_KHAO_TU_CHOI] Đơn phúc khảo của bạn nộp quá thời hạn 7 ngày kể từ ngày công bố điểm nên không đủ điều kiện tiếp nhận.",
    "[XAC_NHAN_SV] Giấy xác nhận sinh viên của bạn sẽ được trả sau 3 ngày làm việc."
  ]},
  { id:"QT-07", title:"Quy trình tiếp nhận và giải quyết khiếu nại của người học", owner:"Phòng Thanh tra – Pháp chế", tier:2, version:"2.3", lines:[
    "B1. Bộ phận Một cửa tiếp nhận đơn khiếu nại và vào sổ trong ngày.",
    "B2. Đơn vị được phân công phải có văn bản phản hồi người khiếu nại trong 7 ngày làm việc kể từ ngày nhận đơn.",
    "B3. Trường hợp phức tạp, đơn vị báo cáo Ban Giám hiệu để gia hạn."
  ]},
  { id:"QT-08", title:"Quy trình cấp giấy xác nhận sinh viên", owner:"Phòng Công tác Sinh viên", tier:2, version:"1.1", lines:[
    "B1. Sinh viên nộp yêu cầu cấp giấy xác nhận sinh viên trực tuyến hoặc tại quầy.",
    "B2. Chuyên viên kiểm tra tình trạng học vụ.",
    "B3. Trả kết quả trong 3 ngày làm việc kể từ ngày tiếp nhận."
  ]},
  { id:"QD-13", title:"Quy chế chi tiêu nội bộ", owner:"Hiệu trưởng", tier:3, version:"4.0", lines:[
    "Điều 12. Thẩm quyền duyệt tạm ứng",
    "12.1. Trưởng đơn vị được duyệt đề nghị tạm ứng có giá trị đến 10 triệu đồng.",
    "Điều 19. Kiểm soát chi",
    "19.2. Khoản chi từ 10 triệu đồng trở lên phải có hai chữ ký kiểm soát trước khi giải ngân."
  ]},
  { id:"QT-11", title:"Quy trình tạm ứng và hoàn ứng kinh phí hoạt động", owner:"Phòng Kế hoạch – Tài chính", tier:2, version:"3.5", lines:[
    "B1. Đơn vị lập giấy đề nghị tạm ứng kèm dự toán chi tiết.",
    "B2. Khoản tạm ứng đến 10 triệu đồng do Trưởng đơn vị duyệt; vượt mức này chuyển Phòng Kế hoạch – Tài chính.",
    "B3. Hoàn ứng chậm nhất 10 ngày làm việc sau khi kết thúc hoạt động.",
    "Ghi chú: Hạn mức tạm ứng 10 triệu đồng tại B2 áp dụng cho một lần đề nghị, không cộng dồn trong tháng."
  ]},
  { id:"BM-12", title:"Giấy đề nghị tạm ứng (BM-TC-03)", owner:"Phòng Kế hoạch – Tài chính", tier:2, version:"1.6", lines:[
    "Kính gửi: Phòng Kế hoạch – Tài chính.",
    "Tôi đề nghị được tạm ứng số tiền: ................................ đồng.",
    "Lưu ý: đề nghị tạm ứng đến 10 triệu đồng chỉ cần chữ ký Trưởng đơn vị.",
    "Người đề nghị ký và ghi rõ họ tên."
  ]},
  { id:"HD-14", title:"Hướng dẫn thanh toán dành cho câu lạc bộ và Đoàn – Hội", owner:"Văn phòng Đoàn – Hội", tier:1, version:"2.2", lines:[
    "1. Ban chủ nhiệm câu lạc bộ lập đề nghị tạm ứng gửi Văn phòng Đoàn trước hoạt động 5 ngày.",
    "2. Khoản tạm ứng đến 10 triệu đồng được Trưởng đơn vị duyệt trực tiếp, không cần trình thêm cấp trên.",
    "3. Khoản chi từ 10 triệu đồng trở lên bắt buộc phải có hai chữ ký kiểm soát.",
    "4. Ví dụ: hoạt động dự toán 10.000.000 thì ban chủ nhiệm cần chuẩn bị đầy đủ chứng từ gốc."
  ]}
];

  /* Bộ Verify: 4 ca bắt buộc + 5 ca Escalation 90 giây của Đề A. */
  const SUITE_REQUIRED = [
  { id:"TC-01", desc:"Thay đổi hợp lệ, tài liệu cấp dưới có neo quy định → tự xử lý",
    change:{ ruleId:"R-PK-01", newValue:"5 ngày", issuerTier:2 }, at:{ docId:"QT-02", lineIndex:0 },
    expect:{ outcome:"AUTO_PATCH", category:null } },
  { id:"TC-02", desc:"Vị trí trùng giá trị nhưng thuộc quy định khác → phải từ chối sửa, chuyển tiếp",
    change:{ ruleId:"R-PK-01", newValue:"5 ngày", issuerTier:2 }, at:{ docId:"QT-07", lineIndex:1 },
    expect:{ outcome:"ESCALATE", category:"U2" } },
  { id:"TC-03", desc:"Tài liệu do cấp trên ban hành → khoá quyền sửa, chuyển tiếp",
    change:{ ruleId:"R-PK-01", newValue:"5 ngày", issuerTier:2 }, at:{ docId:"QD-01", lineIndex:1 },
    expect:{ outcome:"ESCALATE", category:"U3" } },
  { id:"TC-04", desc:"Câu lệnh tham chiếu giá trị không có trong sổ đăng ký → từ chối xử lý",
    freeText:"Đổi hạn nộp hồ sơ từ 42 ngày xuống 30 ngày.",
    expect:{ refuse:true } }
];

  const SUITE_ESCALATION = [
  { id:"ESC-01", desc:"Thường quy — quy trình cấp Phòng, dòng có neo",
    change:{ ruleId:"R-PK-01", newValue:"5 ngày", issuerTier:2 }, at:{ docId:"QT-02", lineIndex:4 },
    expect:{ outcome:"AUTO_PATCH", category:null } },
  { id:"ESC-02", desc:"Thường quy — biểu mẫu cấp Phòng",
    change:{ ruleId:"R-PK-01", newValue:"5 ngày", issuerTier:2 }, at:{ docId:"BM-03", lineIndex:1 },
    expect:{ outcome:"AUTO_PATCH", category:null } },
  { id:"ESC-03", desc:"Thường quy — checklist tác nghiệp",
    change:{ ruleId:"R-PK-01", newValue:"5 ngày", issuerTier:2 }, at:{ docId:"CL-05", lineIndex:1 },
    expect:{ outcome:"AUTO_PATCH", category:null } },
  { id:"ESC-04", desc:"Chuyển tiếp — con số không neo vào quy định nào (U1)",
    change:{ ruleId:"R-PK-01", newValue:"5 ngày", issuerTier:2 }, at:{ docId:"HD-04", lineIndex:3 },
    expect:{ outcome:"ESCALATE", category:"U1" } },
  { id:"ESC-05", desc:"Chuyển tiếp — quy chế do Hiệu trưởng ban hành, vượt thẩm quyền (U3)",
    change:{ ruleId:"R-TC-01", newValue:"15 triệu", issuerTier:2 }, at:{ docId:"QD-13", lineIndex:1 },
    expect:{ outcome:"ESCALATE", category:"U3" } }
];

  return deepFreeze({ SEED_REGISTRY, SEED_DOCUMENTS, SUITE_REQUIRED, SUITE_ESCALATION });
});
