import React, { useEffect, useRef } from 'react';
import { ScriptWord } from '../types';

interface TeleprompterProps {
  words: ScriptWord[];
  activeWordIndex: number;
  fontSize: number;
  opacity: number;
}

const Teleprompter: React.FC<TeleprompterProps> = ({
  words,
  activeWordIndex,
  fontSize,
  opacity,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);

  // Auto-scroll to keep active word in view
  useEffect(() => {
    if (activeWordRef.current && containerRef.current) {
      activeWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
    }
  }, [activeWordIndex]);

  if (words.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/50 italic pointer-events-none">
        Paste your script to begin...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-y-auto no-scrollbar px-8 py-32 pointer-events-none z-20 text-center transition-opacity duration-300"
      style={{
        backgroundColor: `rgba(0,0,0, ${opacity * 0.4})`, // Adds a slight dim based on opacity pref
      }}
    >
      <div 
        className="max-w-3xl mx-auto leading-relaxed transition-all duration-300 ease-in-out"
        style={{ fontSize: `${fontSize}px` }}
      >
        {words.map((wordObj, index) => {
          const isActive = index === activeWordIndex;
          const isSpoken = index < activeWordIndex;
          
          return (
            <span
              key={wordObj.id}
              ref={isActive ? activeWordRef : null}
              className={`
                inline-block mx-1.5 transition-colors duration-200 rounded px-1
                ${isActive ? 'text-yellow-400 scale-105 font-bold' : ''}
                ${isSpoken ? 'text-white/40' : 'text-white'}
                ${!isSpoken && !isActive ? 'opacity-' + (Math.floor(opacity * 100)) : ''}
              `}
              style={{
                textShadow: '0 2px 4px rgba(0,0,0,0.8)'
              }}
            >
              {wordObj.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default Teleprompter;
