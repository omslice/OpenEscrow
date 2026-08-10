import { useEffect, useId, useState, type KeyboardEvent } from "react";
import "./AddressAutocomplete.css";

export type AddressSuggestion = {
  id: string;
  label: string;
  countryCode: string | null;
  stateCode: string | null;
  city: string | null;
  county: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  attestation: string | null;
};

function normalizeSuggestions(payload: unknown): AddressSuggestion[] {
  if (!payload || typeof payload !== "object") return [];
  const candidate = payload as {
    suggestions?: unknown;
    results?: unknown;
  };
  const values = Array.isArray(candidate.suggestions)
    ? candidate.suggestions
    : Array.isArray(candidate.results)
      ? candidate.results
      : [];

  return values
    .map((value, index): AddressSuggestion | null => {
      if (typeof value === "string" && value.trim()) {
        return {
          id: `${index}-${value}`,
          label: value.trim(),
          countryCode: null,
          stateCode: null,
          city: null,
          county: null,
          postalCode: null,
          latitude: null,
          longitude: null,
          attestation: null,
        };
      }
      if (!value || typeof value !== "object") return null;
      const item = value as {
        id?: unknown;
        label?: unknown;
        address?: unknown;
        formattedAddress?: unknown;
        countryCode?: unknown;
        stateCode?: unknown;
        city?: unknown;
        county?: unknown;
        postalCode?: unknown;
        latitude?: unknown;
        longitude?: unknown;
        attestation?: unknown;
      };
      const label = [item.label, item.formattedAddress, item.address].find(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      );
      if (!label) return null;
      return {
        id: typeof item.id === "string" ? item.id : `${index}-${label}`,
        label: label.trim(),
        countryCode:
          typeof item.countryCode === "string"
            ? item.countryCode.toUpperCase()
            : null,
        stateCode:
          typeof item.stateCode === "string"
            ? item.stateCode.toUpperCase()
            : null,
        city: typeof item.city === "string" ? item.city.trim() || null : null,
        county:
          typeof item.county === "string" ? item.county.trim() || null : null,
        postalCode:
          typeof item.postalCode === "string"
            ? item.postalCode.trim() || null
            : null,
        latitude:
          typeof item.latitude === "number" && Number.isFinite(item.latitude)
            ? item.latitude
            : null,
        longitude:
          typeof item.longitude === "number" && Number.isFinite(item.longitude)
            ? item.longitude
            : null,
        attestation:
          typeof item.attestation === "string" && item.attestation
            ? item.attestation
            : null,
      };
    })
    .filter((value): value is AddressSuggestion => Boolean(value))
    .slice(0, 6);
}

export function AddressAutocomplete({
  value,
  onChange,
  onVerifiedSuggestion,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onVerifiedSuggestion?: (suggestion: AddressSuggestion) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const inputId = useId();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<{
    label: string;
    attested: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lookupUnavailable, setLookupUnavailable] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const query = value.trim();
    if (disabled || selectedAddress?.label === value || query.length < 4) {
      setSuggestions([]);
      setIsOpen(false);
      setActiveIndex(-1);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const url = new URL("/api/address-suggestions", window.location.origin);
        url.searchParams.set("q", query);
        const response = await fetch(url, {
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Address suggestions are unavailable.");
        }
        const next = normalizeSuggestions(await response.json());
        setSuggestions(next);
        setIsOpen(next.length > 0);
        setActiveIndex(-1);
        setLookupUnavailable(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSuggestions([]);
        setIsOpen(false);
        setActiveIndex(-1);
        setLookupUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, value, selectedAddress]);

  function updateValue(next: string) {
    setSelectedAddress(null);
    setLookupUnavailable(false);
    onChange(next);
  }

  function selectSuggestion(suggestion: AddressSuggestion) {
    onChange(suggestion.label);
    onVerifiedSuggestion?.(suggestion);
    setSelectedAddress({
      label: suggestion.label,
      attested: Boolean(suggestion.attestation),
    });
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setLookupUnavailable(false);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
      return;
    }
    if (event.key === "Home" && isOpen) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && isOpen) {
      event.preventDefault();
      setActiveIndex(suggestions.length - 1);
      return;
    }
    if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    }
  }

  return (
    <div className="address-autocomplete">
      <label htmlFor={inputId}>Rental property address</label>
      <div className="address-autocomplete-control">
        <input
          id={inputId}
          value={value}
          onChange={(event) => updateValue(event.target.value)}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          onBlur={() => {
            setIsOpen(false);
            setActiveIndex(-1);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="123 Main Street, City, State 00000"
          autoComplete="off"
          disabled={disabled}
          data-proposal-field="propertyAddress"
          aria-invalid={invalid}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-activedescendant={
            isOpen && activeIndex >= 0
              ? `${listId}-option-${activeIndex}`
              : undefined
          }
          aria-busy={isLoading}
          role="combobox"
        />
        {isLoading && <span className="address-lookup-state">Searching…</span>}
        {selectedAddress?.label === value && (
          <span
            className="address-verified"
            aria-label={
              selectedAddress.attested
                ? "Server-validated address selection"
                : "Formatted address selection"
            }
          >
            {selectedAddress.attested ? "✓ Validated" : "Formatted"}
          </span>
        )}
      </div>
      <ul
        id={listId}
        className="address-suggestions"
        role="listbox"
        hidden={!isOpen}
      >
        {isOpen
          ? suggestions.map((suggestion, index) => (
              <li key={suggestion.id} role="none">
                <button
                  id={`${listId}-option-${index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={activeIndex === index}
                  className={activeIndex === index ? "active" : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectSuggestion(suggestion)}
                >
                  {suggestion.label}
                </button>
              </li>
            ))
          : null}
      </ul>
      <span className="address-sr-status" role="status" aria-live="polite">
        {isLoading
          ? "Searching for addresses."
          : isOpen
            ? `${suggestions.length} address suggestion${suggestions.length === 1 ? "" : "s"} available. Use the up and down arrow keys to review them.`
            : ""}
      </span>
      {lookupUnavailable && (
        <small className="address-lookup-note">
          Suggestions are temporarily unavailable. You can still enter the
          address manually.
        </small>
      )}
      {!disabled && (
        <small className="address-attribution">
          Address suggestions ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap contributors
          </a>
          . Use a complete U.S. street address, including the building number.
          A “Validated” result locks the matching state profile; a manually
          entered address does not.
        </small>
      )}
    </div>
  );
}
