const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: './client/js/app.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.[contenthash].js',
        clean: true
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: 'TensorFlow.js Edge Inference System',
            template: './client/index.html',
            inject: 'body',
            minify: {
                removeComments: true,
                collapseWhitespace: true
            }
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'client/assets', to: 'assets', noErrorOnMissing: true },
                { from: 'models', to: 'models', noErrorOnMissing: true }
            ]
        })
    ],
    resolve: {
        extensions: ['.js'],
        fallback: {
            "fs": false,
            "path": false,
            "crypto": false
        }
    },
    devServer: {
        static: {
            directory: path.join(__dirname, 'dist')
        },
        compress: true,
        port: 8080,
        hot: true,
        open: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                secure: false
            }
        }
    },
    optimization: {
        splitChunks: {
            chunks: 'all',
            cacheGroups: {
                tensorflow: {
                    test: /[\\/]node_modules[\\/](@tensorflow|@tensorflow-models)[\\/]/,
                    name: 'tensorflow',
                    priority: 10
                },
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    priority: -10
                }
            }
        }
    },
    performance: {
        hints: false,
        maxEntrypointSize: 512000,
        maxAssetSize: 512000
    }
};