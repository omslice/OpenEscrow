import{D as e}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t}from"./ErrorMessage-D8VaAP5m-BHdRttjr.js";var n=e.label`
  display: block;
  position: relative;
  width: 100%;
  height: 56px;

  && > :first-child {
    position: absolute;
    left: 0.75em;
    top: 50%;
    transform: translate(0, -50%);
  }

  && > input {
    font-size: 16px;
    line-height: 24px;
    color: var(--privy-color-foreground);

    padding: 12px 88px 12px 52px;
    flex-grow: 1;
    background: var(--privy-color-background);
    border: 1px solid
      ${({$error:e})=>e?`var(--privy-color-error) !important`:`var(--privy-color-foreground-4)`};
    border-radius: var(--privy-border-radius-md);
    width: 100%;
    height: 100%;

    /* Tablet and Up */
    @media (min-width: 441px) {
      font-size: 14px;
      padding-right: 78px;
    }

    :focus {
      outline: none;
      border-color: ${({$error:e})=>e?`var(--privy-color-error) !important`:`var(--privy-color-accent-light)`};
      box-shadow: ${({$error:e})=>e?`none`:`0 0 0 1px var(--privy-color-accent-light)`};
    }

    :autofill,
    :-webkit-autofill {
      background: var(--privy-color-background);
    }

    && > input::placeholder {
      color: var(--privy-color-foreground-3);
    }
    &:disabled {
      opacity: 0.4; /* Make it visually appear disabled */
      cursor: not-allowed; /* Change cursor to not-allowed */
    }
    &:disabled,
    &:disabled:hover,
    &:disabled > span {
      color: var(--privy-color-foreground-3); /* Change text color to grey */
    }
  }

  && > button:last-child {
    right: 0px;
    line-height: 24px;
    padding: 13px 17px;
    :focus {
      outline: none;
    }
    &:disabled {
      opacity: 0.4; /* Make it visually appear disabled */
      cursor: not-allowed; /* Change cursor to not-allowed */
    }
    &:disabled,
    &:disabled:hover,
    &:disabled > span {
      color: var(--privy-color-foreground-3); /* Change text color to grey */
    }
  }
`,r=e(n)`
  background-color: var(--privy-color-background);
  transition: background-color 200ms ease;

  && > button {
    right: 0;
    line-height: 24px;
    position: absolute;
    padding: 13px 17px;
    background-color: #090;

    :focus {
      outline: none;
      border-color: var(--privy-color-accent);
    }
  }
`,i=e(n)`
  && > input {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    padding-right: ${e=>e.$stacked?`16px`:`88px`};

    border: 1px solid
      ${({$error:e})=>e?`var(--privy-color-error) !important`:`var(--privy-color-foreground-4)`};

    && > input::placeholder {
      color: var(--privy-color-foreground-3);
    }
  }

  && > :last-child {
    right: 16px;
    position: absolute;
    top: 50%;
    transform: translate(0, -50%);
  }

  && > button:last-child {
    right: 0px;
    line-height: 24px;
    padding: 13px 17px;

    :focus {
      outline: none;
    }
  }
`,a=e.div`
  width: 100%;

  /* Add styling for the ErrorMessage within EmailInput */
  && > ${t} {
    display: block;
    text-align: left;
    padding-left: var(--privy-border-radius-md);
    padding-bottom: 5px;
  }
`;export{r as n,a as r,i as t};