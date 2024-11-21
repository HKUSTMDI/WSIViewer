import hashlib
import json
import os
import flask
import flask_cors
from flask import request,send_file,Response
import openslide
from openslide.deepzoom import DeepZoomGenerator
from io import BytesIO
import sys

app = flask.Flask(__name__)
flask_cors.CORS(app)


# where to put and get slides
app.config['SLIDE_DIR'] = "./images/"


def file_md5(fileName):
    m = hashlib.md5()
    blocksize = 2**20
    with open(fileName, "rb") as f:
        while True:
            buf = f.read(blocksize)
            if not buf:
                break
            m.update(buf)
    return m.hexdigest()


# given a path, get metadata
def get_metadata(filename, slide_dir, extended):
    # TODO consider restricting filepath
    metadata = {}
    filepath = os.path.join(slide_dir, filename)
    if not os.path.isfile(filepath):
        msg = {"error": "No such file"}
        print(msg)
        return msg
    try:
        slide = openslide.OpenSlide(filepath)
    except BaseException as error:
        msg = {"type": "Openslide", "error": str(error)}
        print(msg)
        return msg
    slide_properties = slide.properties
    if extended:
        info = {k: v for (k, v) in slide_properties.items()}
        return info
    else:
        metadata['mpp-x'] = slide_properties.get(openslide.PROPERTY_NAME_MPP_X, None)
        metadata['mpp-y'] = slide_properties.get(openslide.PROPERTY_NAME_MPP_Y, None)
        metadata['height'] = slide_properties.get(
            openslide.PROPERTY_NAME_BOUNDS_HEIGHT, None
        ) or slide_properties.get("openslide.level[0].height", None)
        metadata['width'] = slide_properties.get(
            openslide.PROPERTY_NAME_BOUNDS_WIDTH, None
        ) or slide_properties.get("openslide.level[0].width", None)
        metadata['vendor'] = slide_properties.get(openslide.PROPERTY_NAME_VENDOR, None)
        metadata['level_count'] = int(slide_properties.get('level_count', 1))
        metadata['objective'] = float(
            slide_properties.get(openslide.PROPERTY_NAME_OBJECTIVE_POWER, 0)
            or slide_properties.get("aperio.AppMag", -1.0)
        )
        metadata['md5sum'] = file_md5(filepath)
        metadata['comment'] = slide_properties.get(
            openslide.PROPERTY_NAME_COMMENT, None
        )
        metadata['study'] = ""
        metadata['specimen'] = ""
        return metadata


# routes

@app.route("/api/test", methods=['GET'])
def test_route():
    """Test server status"""
    return '{"Status":"up"}'


@app.route("/api/sliceInfo/openslide/<path:filename>", methods=['GET'])
def single_slide(filename):
    """Get slide metadata

    Args:
        filename (str): filename (with suffix)

    Returns:
        _type_: _description_
    """
    extended = request.args.get('extended', True)
    print(filename,app.config['SLIDE_DIR'])
    res = get_metadata(filename, app.config['SLIDE_DIR'], extended)
    if hasattr(res, 'error'):
        return flask.Response(json.dumps(res), status=500)
    else:
        return flask.Response(json.dumps(res), status=200)
    

@app.route("/api/tile/openslide/<path:filename>/<level>/<x>/<y>", methods=['GET'])
def get_tiles(filename,level,x,y):
    filepath = os.path.join(app.config['SLIDE_DIR'], filename)
    if not os.path.isfile(filepath):
        msg = {"error": "No such file"}
        print(msg)
        return msg
    # metadata['location'] = filepath
    try:
        slide = openslide.OpenSlide(filepath)
    except BaseException as error:
        msg = {"type": "Openslide", "error": str(error)}
        print(msg)
        return msg
    slide_properties = slide.properties
    tile_size = slide_properties.get('openslide.level[0].tile-width')
    deep_zoom = DeepZoomGenerator(slide,tile_size=int(tile_size),overlap=0)
    total_level_count = len(deep_zoom.level_tiles)
    x = int(x)
    y = int(y)
    level = total_level_count - int(level) - 1
    img = deep_zoom.get_tile(level,(x,y))
    img_io = BytesIO()
    img.save(img_io, 'JPEG', quality=100)
    img_io.seek(0)
    return send_file(img_io,mimetype='image/gif')


@app.route("/api/dzi/openslide/<filename>", methods=['GET'])
def get_dzi(filename):
    filepath = os.path.join(app.config['SLIDE_DIR'], filename)
    if not os.path.isfile(filepath):
        msg = {"error": "No such file"}
        print(msg)
        return msg
    # metadata['location'] = filepath
    try:
        slide = openslide.OpenSlide(filepath)
    except BaseException as error:
        msg = {"type": "Openslide", "error": str(error)}
        print(msg)
        return msg
    slide_properties = slide.properties
    tile_size = slide_properties.get('openslide.level[0].tile-width')
    deep_zoom = DeepZoomGenerator(slide,tile_size=int(tile_size),overlap=0)
    dzi_info = deep_zoom.get_dzi('jpeg')
    return Response(dzi_info, mimetype='text/xml')


@app.route("/api/dzi/openslide/<path:filename>/<level>/<pos>", methods=['GET'])
def get_dzi_tiles(filename,level,pos):
    print('level:',level,flush=True)
    filename = filename.replace('_files','')
    filepath = os.path.join(app.config['SLIDE_DIR'], filename)
    if not os.path.isfile(filepath):
        msg = {"error": "No such file"}
        print(msg)
        return msg
    # metadata['location'] = filepath
    try:
        slide = openslide.OpenSlide(filepath)
    except BaseException as error:
        msg = {"type": "Openslide", "error": str(error)}
        print(msg)
        return msg
    slide_properties = slide.properties
    tile_size = slide_properties.get('openslide.level[0].tile-width')
    deep_zoom = DeepZoomGenerator(slide,tile_size=int(tile_size),overlap=0)
    total_level_count = len(deep_zoom.level_tiles)
    x, y = pos.replace('.jpeg','').split('_')
    x = int(x)
    y = int(y)
    level = int(level)
    # level = total_level_count - int(level) - 1
    img = deep_zoom.get_tile(level,(x,y))
    img_io = BytesIO()
    img.save(img_io, 'JPEG', quality=100)
    img_io.seek(0)
    return send_file(img_io,mimetype='image/gif')


@app.route("/api/thumbnail/openslide/<path:filename>", methods=['GET'])
def get_thumbnail(filename):
    filepath = os.path.join(app.config['SLIDE_DIR'], filename)
    if not os.path.isfile(filepath):
        msg = {"error": "No such file"}
        print(msg)
        return msg
    # metadata['location'] = filepath
    try:
        slide = openslide.OpenSlide(filepath)
    except BaseException as error:
        msg = {"type": "Openslide", "error": str(error)}
        print(msg)
        return msg
    thumbnail = slide.get_thumbnail((256,256))
    img_io = BytesIO()
    thumbnail.save(img_io, 'JPEG', quality=100)
    img_io.seek(0)
    return send_file(img_io,mimetype='image/jpeg')


@app.route("/api/region/openslide/<path:filename>/<int:x>/<int:y>/<int:w>/<int:h>/<int:level>")
def get_region(filename,x,y,w,h,level):
    filepath = os.path.join(app.config['SLIDE_DIR'], filename)
    if not os.path.isfile(filepath):
        msg = {"error": "No such file"}
        return msg
    try:
        slide = openslide.OpenSlide(filepath)
    except BaseException as error:
        msg = {"type": "Openslide", "error": str(error)}
        return msg
    sliceInfo = slide.properties
    downsample = int(sliceInfo.get(f'openslide.level[{level}].downsample'))
    x = x * downsample
    y = y * downsample
    img = slide.read_region((x,y),level,(w,h))
    img_io = BytesIO()
    img.save(img_io, 'JPEG', quality=100)
    img_io.seek(0)
    return send_file(img_io,mimetype='image/png')


if __name__ == "__main__":
    port = sys.argv[1] if len(sys.argv) > 1 else 5000
    app.run(host='0.0.0.0', port=port, debug=True)

