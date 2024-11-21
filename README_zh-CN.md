# WSIViewer

一个用网页查看WSI图片的工具。

## 使用

克隆代码

将wsi图片放到wsiviewer文件夹下的images文件中。

在wsiviewer目录下运行：

```shell
docker compose up
```

在浏览器中打开网页：[http://localhost:8082/?file=your_wsi_name.tiff](http://localhost:8082/?file=your_wsi_name.tiff) 即可看到wsi图片。

## API

docker container运行之后可以在浏览器中打开：:[http://localhost:8082/api/docs](http://localhost:8082/api/docs)查看FASTAPI自动生成的文档。

## 开发

待完成
