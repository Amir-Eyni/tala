"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { useGoldPrices } from "@/app/hooks/useGoldPrices";
import { formatToman } from "@/utils/formatPrice";

const amountFormatter = new Intl.NumberFormat("fa-IR", {
  maximumFractionDigits: 4,
});

const CONVERTIBLE_ASSETS = [
  { id: "coin", title: "سکه تمام امامی", unit: "سکه" },
  { id: "bahar", title: "سکه بهار آزادی", unit: "سکه" },
  { id: "gold18k", title: "گرم طلای ۱۸ عیار", unit: "گرم" },
  { id: "gold24k", title: "گرم طلای ۲۴ عیار", unit: "گرم" },
  { id: "silver", title: "گرم نقره", unit: "گرم" },
  { id: "usdt", title: "تتر (USDT)", unit: "تتر" },
  { id: "usd", title: "دلار", unit: "دلار" },
  { id: "euro", title: "یورو", unit: "یورو" },
];

function cleanTomanInput(value) {
  return value
    .replace(/,/g, "")
    .replace(/،/g, "")
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/\D/g, "");
}

function countDigits(value) {
  return cleanTomanInput(value).length;
}

function formatAmount(value) {
  if (value === "") {
    return "";
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue.toLocaleString("fa-IR")
    : value;
}

function getFormattedCaret(value, digitOffset) {
  let seen = 0;

  for (let index = 0; index < value.length; index += 1) {
    if (/\d|[۰-۹٠-٩]/.test(value[index])) {
      seen += 1;
      if (seen === digitOffset) {
        return index + 1;
      }
    }
  }

  return digitOffset === 0 ? 0 : value.length;
}

export default function QuickConverter() {
  const { data } = useGoldPrices();
  const [amount, setAmount] = useState("");
  const inputRef = useRef(null);
  const pendingCaretRef = useRef(null);
  const formattedAmount = formatAmount(amount);
  const numericAmount = amount === "" ? null : Number(amount);
  const validAmount =
    numericAmount !== null && Number.isFinite(numericAmount);
  const assets = data?.assets ?? {};

  useLayoutEffect(() => {
    const pendingCaret = pendingCaretRef.current;
    if (pendingCaret === null || !inputRef.current) {
      return;
    }

    const caret = getFormattedCaret(formattedAmount, pendingCaret);
    inputRef.current.setSelectionRange(caret, caret);
    pendingCaretRef.current = null;
  }, [formattedAmount]);

  function handleAmountChange(event) {
    const { value, selectionStart = value.length } = event.currentTarget;
    const rawAmount = cleanTomanInput(value);
    const caretDigitOffset = countDigits(value.slice(0, selectionStart));
    pendingCaretRef.current = caretDigitOffset;
    setAmount(rawAmount);

    if (rawAmount === amount) {
      const formattedValue = formatAmount(amount);
      event.currentTarget.value = formattedValue;
      const caret = getFormattedCaret(formattedValue, caretDigitOffset);
      event.currentTarget.setSelectionRange(caret, caret);
      pendingCaretRef.current = null;
    }
  }

  function handleAmountKeyDown(event) {
    const input = event.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;

    if (
      event.key !== "Backspace" ||
      start === null ||
      start !== end ||
      start === 0
    ) {
      return;
    }

    const separator = input.value[start - 1];
    if (separator !== "," && separator !== "٬") {
      return;
    }

    event.preventDefault();
    const caretDigitOffset = countDigits(input.value.slice(0, start));
    const nextAmount =
      amount.slice(0, Math.max(0, caretDigitOffset - 1)) +
      amount.slice(caretDigitOffset);
    pendingCaretRef.current = Math.max(0, caretDigitOffset - 1);
    setAmount(nextAmount);
  }

  return (
    <section
      aria-labelledby="quick-converter-title"
      className="mt-8 rounded-hero border border-line bg-surface p-5 sm:p-7"
    >
      <div className="text-right">
        <h2
          className="text-lg font-bold text-brand sm:text-xl"
          id="quick-converter-title"
        >
          ماشین‌حساب تبدیل
        </h2>
        <p className="mt-1 text-sm text-muted">
          معادل مبلغ را با آخرین قیمت‌های موجود محاسبه کنید.
        </p>
      </div>

      <label
        className="mt-5 block text-right text-sm font-medium text-text"
        htmlFor="converter-amount"
      >
        مبلغ به تومان
      </label>
      <input
        autoComplete="off"
        className="mt-2 w-full rounded-control border border-line bg-bg px-4 py-3 text-right text-lg text-text tala-numeric outline-none transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        id="converter-amount"
        inputMode="numeric"
        onChange={handleAmountChange}
        onKeyDown={handleAmountKeyDown}
        placeholder="مثلاً ۵۰,۰۰۰,۰۰۰"
        ref={inputRef}
        type="text"
        value={formattedAmount}
      />

      <div
        aria-live="polite"
        className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {CONVERTIBLE_ASSETS.map(({ id, title, unit }) => {
          const price = assets[id]?.price;
          const hasPrice =
            typeof price === "number" && Number.isFinite(price) && price > 0;
          const equivalent =
            validAmount && hasPrice ? numericAmount / price : null;

          return (
            <div
              className="rounded-row border border-line bg-surface-2 p-4 text-right"
              key={id}
            >
              <h3 className="text-sm font-semibold text-muted">{title}</h3>
              <p className="mt-2 text-lg font-bold text-text tala-numeric">
                {equivalent === null
                  ? "—"
                  : amountFormatter.format(equivalent).replace(/\u066b/g, ".")}
                <span className="mr-1 text-sm font-medium text-muted">
                  {unit}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">
                قیمت واحد: {hasPrice ? `${formatToman(price)} تومان` : "ناموجود"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
