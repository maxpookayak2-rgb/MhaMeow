บ้านอุ่นใจ: เปลี่ยนจากเดโมเป็นระบบออนไลน์

ขั้นตอนเตรียมระบบ
1. เข้า https://supabase.com/ และสร้าง Project ใหม่
2. เปิด SQL Editor ใน Dashboard แล้ววางเนื้อหาไฟล์ supabase-schema.sql ทั้งหมด จากนั้นกด Run
3. เปิด Project Settings > API และคัดลอก Project URL กับ Publishable key (หรือ anon/public key รุ่นเก่า)
4. ใส่ค่าลงใน supabase-config.js โดยแทนข้อความตัวอย่าง ห้ามใช้ service_role/secret key ในเว็บ
5. ใน Authentication > URL Configuration ให้ตั้ง Site URL เป็น URL ที่ใช้เปิดเว็บจริง และเพิ่ม URL ทดสอบใน Redirect URLs ตามการใช้งาน
6. เปิด Authentication > Providers > Email และตั้งค่าการยืนยันอีเมลตามต้องการ
7. เว็บที่เปิดด้วย file:// อาจมีข้อจำกัดเรื่อง auth redirect; แนะนำให้เปิดผ่าน local web server แล้วค่อย deploy ขึ้น HTTPS hosting

ตารางที่สร้าง: profiles, listings, conversations, messages
นโยบาย RLS จำกัดให้เจ้าของแก้ไขประกาศของตัวเอง และเฉพาะคู่สนทนาอ่าน/ส่งข้อความในห้องของตนได้

ข้อควรรู้
- ต้องใส่ Project URL และ publishable/anon key ก่อนจึงเชื่อมต่อฐานข้อมูลได้
- อย่าเผยแพร่ service_role/secret key ในไฟล์ JavaScript หรือ GitHub
- ควรเปิดการยืนยันอีเมล และไม่เผยแพร่ที่อยู่บ้านหรือข้อมูลส่วนตัวในประกาศ
- รูปภาพยังเป็น URL ภายนอกในเวอร์ชันนี้ ไม่ใช่ระบบอัปโหลดไฟล์
- หลังตั้งค่า Supabase ต้องทดสอบสมัคร/ล็อกอิน/แชทในโปรเจกต์จริง
