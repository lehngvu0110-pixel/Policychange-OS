// Cấu hình kết nối máy chủ. Khoá "anon" là khoá CÔNG KHAI theo thiết kế của Supabase:
// Row Level Security chỉ cho đọc, mọi thao tác ghi phải qua Edge Function `policy-api` kiểm tra quyền.
// Không bao giờ đặt service_role key hay OPENAI_API_KEY vào tệp này.
// Để chạy hoàn toàn ngoại tuyến, đặt supabaseUrl = ''.
window.PolicyChangeConfig = Object.freeze({
  supabaseUrl: 'https://rsenhrsrzylubjavkqxs.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzZW5ocnNyenlsdWJqYXZrcXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODk0NjEsImV4cCI6MjEwNjI2NTQ2MX0.eAJv3DuWKnzk4wfbUClcHY4Z63rZgkqd7sm1g1t4zFk',
  defaultWorkspace: 'demo',
  pollSeconds: 20
});
