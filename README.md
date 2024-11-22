# WSIViewer

A simple tool to view wsi images on the web page.

## Usage

Clone the repository

Place the WSI image in the images folder under the wsiviewer directory.

Run the following command in the wsiviewer directory:

```shell
docker compose up
```

Open the webpage in your browser: http://localhost:8082/?file=your_wsi_name.tiff to view the WSI image.

## API

After the Docker container is running, you can view the FastAPI auto-generated documentation at:[http://localhost:8082/api/docs](http://localhost:8082/api/docs)

## Development

## License

WSIViewer is released under the MIT license. For details, see the [LICENSE.txt](./LICENSE.txt) file.
