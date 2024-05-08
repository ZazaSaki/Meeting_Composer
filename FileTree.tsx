import React, { useState } from 'react';

interface Folder {
  name: string;
  children?: Folder[];
  toggleFolder : Function;
  isOpen : Boolean;
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
        
        <span onClick={()=>{data.toggleFolder(data, root, true, data.name)}} className={`folder ${data.isOpen ? 'open' : ''}`}>
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
