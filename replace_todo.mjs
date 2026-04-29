import fs from 'fs';

const filePath = 'components/todo/todo-list.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(
  /<button\s*onClick=\{isDropped \? undefined : onToggle\}\s*disabled=\{isDropped\}\s*className="mt-0\.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-110 active:scale-95"\s*style=\{\{\s*backgroundColor: isDropped \? "#666" : todo\.completed \? "#099981" : "#F23645",\s*border: \`2px solid \$\{isDropped \? "#666" : todo\.completed \? "#099981" : "#F23645"\}\`,\s*\}\}\s*>\s*\{todo\.completed && <Check className="h-2\.5 w-2\.5 text-white" strokeWidth=\{3\} \/>\}\s*\{isDropped && <Ban className="h-2\.5 w-2\.5 text-white" strokeWidth=\{3\} \/>\}\s*<\/button>/g,
  `<button
          onClick={isDropped ? undefined : onToggle}
          disabled={isDropped}
          className={cn(
            "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-110 active:scale-95 border-[1.5px]",
            isDropped 
              ? "border-muted bg-muted" 
              : todo.completed 
                ? "border-primary bg-transparent" 
                : "border-muted-foreground/30 bg-transparent hover:border-primary/50"
          )}
        >
          {todo.completed && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
          {isDropped && <Ban className="h-3 w-3 text-muted-foreground" strokeWidth={3} />}
        </button>`
);

content = content.replace(
  /<button\s*onClick=\{\(\) => onToggleSubtask\(sub\.id\)\}\s*className="h-3\.5 w-3\.5 rounded-sm border border-muted-foreground\/30 flex items-center justify-center shrink-0"\s*style=\{sub\.completed \? \{ backgroundColor: "#099981", borderColor: "#099981" \} : \{\}\}\s*>\s*\{sub\.completed && <Check className="h-2 w-2 text-white" strokeWidth=\{3\} \/>\}\s*<\/button>/g,
  `<button
                    onClick={() => onToggleSubtask(sub.id)}
                    className={cn(
                      "h-3.5 w-3.5 rounded-sm flex items-center justify-center shrink-0 border",
                      sub.completed ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30 bg-transparent"
                    )}
                  >
                    {sub.completed && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </button>`
);

fs.writeFileSync(filePath, content);
console.log('Todo replaced');
