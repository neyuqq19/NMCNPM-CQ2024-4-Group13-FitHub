import { useEffect, useRef, useState } from "react";
import { date } from "../data";

export function trainerDateLabel(iso: string) {
  return iso ? date(iso.slice(0, 10)) : "";
}

type Props = {
  value: string;
  onChange: (iso: string) => void;
  name?: string;
  required?: boolean;
  min?: string;
  max?: string;
};

function parseDay(text: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return "";
  const iso = match[3] + "-" + match[2] + "-" + match[1];
  const day = new Date(iso + "T00:00:00Z");
  return Number.isFinite(day.getTime()) &&
    day.toISOString().slice(0, 10) === iso
    ? iso
    : "";
}

export function TrainerDateField({
  value,
  onChange,
  name,
  required,
  min,
  max,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => trainerDateLabel(value));
  const [lastValue, setLastValue] = useState(value);
  // Keep an incomplete date editable, even in a navigator that only accepts valid days.
  if (value !== lastValue) {
    setLastValue(value);
    if (parseDay(text) !== value) setText(trainerDateLabel(value));
  }

  const iso = parseDay(text);
  let error = "";
  if (text && !iso) error = "Nhập ngày hợp lệ theo dạng dd/MM/yyyy.";
  else if (iso && min && iso < min)
    error = "Ngày sớm nhất là " + trainerDateLabel(min) + ".";
  else if (iso && max && iso > max)
    error = "Ngày muộn nhất là " + trainerDateLabel(max) + ".";
  useEffect(() => {
    input.current?.setCustomValidity(error);
  }, [error]);

  return (
    <>
      <input
        ref={input}
        type="text"
        placeholder="dd/MM/yyyy"
        maxLength={10}
        required={required}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseDay(event.target.value));
        }}
      />
      {name && <input type="hidden" name={name} value={iso} />}
    </>
  );
}
