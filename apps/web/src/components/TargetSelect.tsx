import * as Select from "@radix-ui/react-select";
import { useId, type ReactNode } from "react";

import type {
  GeneratorClient as Client,
  GeneratorLanguage as Language,
} from "curltocode";

import TargetIcon from "./TargetIcon";
import type { SourceLanguage } from "./TargetIcon";

interface SelectOption<Value extends string> {
  readonly label: string;
  readonly value: Value;
}

interface LanguageSelectProps {
  readonly kind: "language";
  readonly label: string;
  readonly options: readonly SelectOption<Language>[];
  readonly value: Language;
  readonly onValueChange: (value: Language) => void;
  readonly disabled?: boolean;
}

interface ClientSelectProps {
  readonly kind: "client";
  readonly label: string;
  readonly options: readonly SelectOption<Client>[];
  readonly value: Client;
  readonly onValueChange: (value: Client) => void;
  readonly disabled?: boolean;
}

interface SourceSelectProps {
  readonly kind: "source";
  readonly label: string;
  readonly options: readonly SelectOption<SourceLanguage>[];
  readonly value: SourceLanguage;
  readonly onValueChange: (value: SourceLanguage) => void;
  readonly disabled?: boolean;
}

type TargetSelectProps =
  LanguageSelectProps | ClientSelectProps | SourceSelectProps;

interface SelectControlProps<Value extends string> {
  readonly disabled: boolean;
  readonly label: string;
  readonly options: readonly SelectOption<Value>[];
  readonly renderIcon: (value: Value) => ReactNode;
  readonly value: Value;
  readonly onValueChange: (value: Value) => void;
}

function CaretIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3 8.5 3 3 7-7" />
    </svg>
  );
}

function SelectControl<Value extends string>({
  disabled,
  label,
  onValueChange,
  options,
  renderIcon,
  value,
}: SelectControlProps<Value>) {
  const labelId = useId();

  return (
    <Select.Root
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => onValueChange(nextValue as Value)}
    >
      <div className="field">
        <div className="field-label" id={labelId}>
          {label}
        </div>
        <Select.Trigger
          className="select-trigger"
          data-value={value}
          aria-labelledby={labelId}
        >
          {renderIcon(value)}
          <Select.Value className="select-value">
            {options.find((option) => option.value === value)?.label}
          </Select.Value>
          <Select.Icon className="select-caret">
            <CaretIcon />
          </Select.Icon>
        </Select.Trigger>
      </div>
      <Select.Portal>
        <Select.Content
          className="select-popup"
          position="popper"
          sideOffset={6}
          align="start"
        >
          <Select.ScrollUpButton className="select-scroll-arrow">
            <CaretIcon />
          </Select.ScrollUpButton>
          <Select.Viewport className="select-list">
            {options.map((option) => (
              <Select.Item
                className="select-item"
                data-value={option.value}
                key={option.value}
                value={option.value}
              >
                {renderIcon(option.value)}
                <Select.ItemText className="select-item-text">
                  {option.label}
                </Select.ItemText>
                <Select.ItemIndicator className="select-item-indicator">
                  <CheckIcon />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="select-scroll-arrow select-scroll-arrow-down">
            <CaretIcon />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export default function TargetSelect(props: TargetSelectProps) {
  if (props.kind === "language") {
    return (
      <SelectControl
        disabled={props.disabled ?? false}
        label={props.label}
        onValueChange={props.onValueChange}
        options={props.options}
        renderIcon={(value) => <TargetIcon kind="language" value={value} />}
        value={props.value}
      />
    );
  }

  if (props.kind === "source") {
    return (
      <SelectControl
        disabled={props.disabled ?? false}
        label={props.label}
        onValueChange={props.onValueChange}
        options={props.options}
        renderIcon={(value) => <TargetIcon kind="source" value={value} />}
        value={props.value}
      />
    );
  }

  return (
    <SelectControl
      disabled={props.disabled ?? false}
      label={props.label}
      onValueChange={props.onValueChange}
      options={props.options}
      renderIcon={(value) => <TargetIcon kind="client" value={value} />}
      value={props.value}
    />
  );
}
