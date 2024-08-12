import React, {useEffect,useRef} from "react";
import OpenSeadragon from 'openseadragon';
import { isDevelopment } from "./misc/getEnviron";

export default function WSIViewer () {
    const ref = useRef();
    
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const file = urlParams.get('file');
        const tileSourcesUrl = isDevelopment ? `http://localhost:4002/api/dzi/openslide/${file}` : `http://wsibackend/api/dzi/openslide/${file}`
        const viewer = OpenSeadragon({
          id: 'openSeaDragon',
          prefixUrl: 'https://cdn.jsdelivr.net/gh/Benomrans/openseadragon-icons@main/images/',
          tileSources: tileSourcesUrl,
        });
        ref.current = viewer;
        return () => {
          ref.current.destroy();
        };
      }, []);

    return(
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center' }}>
        <div id="openSeaDragon" ref={ref} style={{ width: 'calc(100vw - 40px)', height: 'calc(100vh - 40px)',padding: '20px' }} ></div>
      </div>
    )
}