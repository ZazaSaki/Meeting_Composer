import React, { useState } from 'react';

interface Folder {
  name: string;
  children?: Folder[];
  toggleFolder : Function;
  isOpen : Boolean;
  path?: string[];
}

export function FileTreeRoot(
  data: Folder,
  onRefresh: () => void,
  scopedSearch: boolean = false,
  onToggleScope: () => void = () => {},
  priorityBeforeCities: string[] = [],
  cities: string[] = [],
  priorityAfterCities: string[] = [],
) {
  const children = data.children || [];

  const categorize = (child: Folder): 'org' | 'sector' | 'important' | 'other' => {
    const lower = child.name.toLowerCase();
    if (priorityBeforeCities.some(t => t.toLowerCase() === lower)) return 'org';
    if (cities.some(c => lower.includes(c.toLowerCase()))) return 'sector';
    if (priorityAfterCities.some(t => t.toLowerCase() === lower)) return 'important';
    return 'other';
  };

  const orgs      = children.filter(c => categorize(c) === 'org');
  const sectors   = children.filter(c => categorize(c) === 'sector');
  const important = children.filter(c => categorize(c) === 'important' || categorize(c) === 'other');

  const Column = ({ label, items }: { label: string; items: Folder[] }) => (
    <div className="mc-tree-col">
      <div className="mc-tree-col-header">{label}</div>
      {items.map((child, i) => <div key={i}>{FileTree(child, 0, data)}</div>)}
    </div>
  );

  return (
    <div>
      <div className="mc-tree-toolbar">
        <button onClick={onRefresh}>⟳ Refresh</button>
        <button onClick={onToggleScope}>{scopedSearch ? '📍 Scoped' : '🌐 Global'}</button>
      </div>
      <div className="mc-tree-columns">
        <Column label="Organizations" items={orgs} />
        <Column label="Sectors"       items={sectors} />
        <Column label="Important Topics" items={important} />
      </div>
    </div>
  );
}

function FileTree(data: Folder, id:any=0, root = null){
  
  //console.log("inside of function");
  //const [isOpen, setIsOpen] = useState(false);
  //console.log("I created a ");
  //const toggleFolder = () => setIsOpen(!isOpen);

  const space = () => {
    let out = '';
    for (let index = 0; index < id; index++) {
      out += '|----';
    }
    return(out);
  }

  const sign = ()=>{
    if(data.children?.length>0){
      if (!data.isOpen) {
        return "+";
      }
      return "";
    }
  }
  

  const renderChildren = (children: []) => {
    return children.map((child) => {
      //console.log("child");
      
      return(
        <div>{FileTree(child, id+1, root)}</div>
      
    )});
  };

  // console.log("Father");
  return (
    <span className="file-tree-item">
      {data.children ? (
        
        <span onClick={(e)=>{e.stopPropagation(); data.toggleFolder(data, root, true, data.name, data.path || [])}} className={`folder ${data.isOpen ? 'open' : ''}`}>
          {space()}{data.name}{sign()}
          {data.isOpen && data.children && <span className="children">{renderChildren(data.children)}</span>}

        </span>
      ) : (
        <span className="file">
          {space()}{data.name}</span>
      )}
      
    </span>
  );


// const FileTree = () => {
//   return(
//      <div className="file-tree-item">
//       <h1>Here I am</h1>
//      </div>

//   );

};

export default FileTree;
