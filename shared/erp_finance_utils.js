(function () {
  function normalizePaymentMethodValue(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\/\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isDeferredPaymentMethod(value) {
    var method = normalizePaymentMethodValue(value);
    return (
      method.indexOf("deferred") >= 0 ||
      method.indexOf("differe") >= 0 ||
      method.indexOf("mouajal") >= 0 ||
      method.indexOf("مؤجل") >= 0 ||
      method.indexOf("مدين") >= 0 ||
      method.indexOf("معلق") >= 0
    );
  }

  function isCashPaymentMethod(value) {
    var method = normalizePaymentMethodValue(value);
    return method.indexOf("cash") >= 0 || method.indexOf("نقد") >= 0 || method.indexOf("espece") >= 0;
  }

  function isAutoPaidPaymentMethod(value) {
    var method = normalizePaymentMethodValue(value);
    return (
      method.indexOf("cash") >= 0 ||
      method.indexOf("credit/debit card") >= 0 ||
      method.indexOf("credit") >= 0 ||
      method.indexOf("bank transfer") >= 0 ||
      method.indexOf("virement bancaire") >= 0 ||
      method.indexOf("carte bancaire") >= 0 ||
      method.indexOf("نقد") >= 0 ||
      method.indexOf("بطاقة") >= 0 ||
      method.indexOf("تحويل بنكي") >= 0
    );
  }

  function getInvoiceComputedStatus(invoiceLike) {
    var total = Math.max(0, Number((invoiceLike && invoiceLike.total) || 0));
    var paid = Math.max(0, Number((invoiceLike && invoiceLike.paid) || 0));
    if (total <= 0 || paid <= 0) return "Pending";
    if (paid >= total) return "Paid";
    return "Partially Paid";
  }

  window.ErpFinanceUtils = {
    normalizePaymentMethodValue: normalizePaymentMethodValue,
    isDeferredPaymentMethod: isDeferredPaymentMethod,
    isCashPaymentMethod: isCashPaymentMethod,
    isAutoPaidPaymentMethod: isAutoPaidPaymentMethod,
    getInvoiceComputedStatus: getInvoiceComputedStatus
  };
})();