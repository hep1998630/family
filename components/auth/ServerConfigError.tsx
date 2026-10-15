export default function ServerConfigError() {
  return (
    <main className="min-h-screen bg-parchment flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm flex flex-col items-center gap-5">
        <h1 className="font-sans text-2xl font-bold text-charcoal">
          خطأ في إعدادات الخادم
        </h1>
        <p className="font-sans text-lg text-walnut-light leading-relaxed">
          تعذّر التحقق من صلاحياتك بسبب خطأ في الخادم، وليس بسبب نقص الصلاحيات.
          تواصل مع المسؤول الرئيسي — راجع سجلات التشغيل (function logs) لمعرفة التفاصيل.
        </p>
      </div>
    </main>
  )
}
