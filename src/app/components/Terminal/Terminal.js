"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Terminal.module.css";

export default function Terminal({ output, onClear, onInputSubmit, isInputRequested }) {
  const outputEndRef = useRef(null);
  const inputRef = useRef(null);
  const [inputValue, setInputValue] = useState("");
  const [activeTab, setActiveTab] = useState("output");

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  // Auto-switch to output tab on run
  useEffect(() => {
    if (output.length > 1 && output[output.length - 1].type === "run") {
      setActiveTab("output");
    }
  }, [output]);

  // Focus input when requested
  useEffect(() => {
    if (isInputRequested) {
      inputRef.current?.focus();
    }
  }, [isInputRequested]);

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && onInputSubmit) {
      onInputSubmit(inputValue);
      setInputValue("");
    }
  };

  const getLineColor = (type) => {
    switch (type) {
      case "run": return "#22c55e";
      case "error": return "#ef4444";
      case "system": return "#eab308";
      case "info": return "#888";
      default: return "#d4d4d4";
    }
  };

  return (
    <div className={styles.terminalContainer}>
      <div className={styles.terminalHeader}>
        <div className={styles.terminalTabs}>
          <button
            className={`${styles.terminalTab} ${activeTab === "output" ? styles.terminalTabActive : ""}`}
            onClick={() => setActiveTab("output")}
          >
            Output
          </button>
        </div>
        <button className={styles.terminalClearBtn} onClick={onClear}>
          Clear
        </button>
      </div>

      <div className={styles.outputPanel}>
        {output.map((line, i) => {
          if (line.type === "input_request") return null;
          return (
            <div key={i} className={styles.outputLine} style={{ color: getLineColor(line.type) }}>
              {line.text}
            </div>
          );
        })}

        {isInputRequested && (
          <div className={styles.inputRow}>
            <span className={styles.inputPrompt}>&gt;</span>
            <input
              ref={inputRef}
              type="text"
              className={styles.inputField}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type input and press Enter..."
            />
          </div>
        )}

        <div ref={outputEndRef} />
      </div>
    </div>
  );
}
