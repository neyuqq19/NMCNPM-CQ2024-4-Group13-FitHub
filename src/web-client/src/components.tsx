import { ArrowLeft, Check, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="FitHub — Trang chủ">
      <span className="brand-icon">
        <img src="/fithub-mark.svg" width="20" height="20" alt="" />
      </span>
      <span>FitHub</span>
    </Link>
  );
}
export function PageHeading({
  title,
  description,
  action,
  back,
  section = "Hội viên",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  back?: string;
  section?: string;
}) {
  return (
    <>
      <div className="breadcrumb">FitHub / {section}</div>
      {back && (
        <Link className="back-link" to={back}>
          <ArrowLeft size={16} aria-hidden="true" /> Quay lại
        </Link>
      )}
      <div className="page-heading">
        <div>
          <h1 tabIndex={-1}>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
    </>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "neutral" | "danger";
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`notice ${error ? "notice-error" : ""}`}
    >
      {error ? (
        <AlertCircle size={18} aria-hidden="true" />
      ) : (
        <Check size={18} aria-hidden="true" />
      )}
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="field-error" id={id}>
      {message}
    </span>
  ) : null;
}
