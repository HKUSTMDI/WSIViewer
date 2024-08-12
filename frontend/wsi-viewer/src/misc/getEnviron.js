const isDevelopment = () => {
    return  process.env.REACT_APP_ENV === 'native_development';
}

export { isDevelopment }